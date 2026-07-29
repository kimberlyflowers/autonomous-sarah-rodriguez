/**
 * Process-local executor backed by durable website_builds rows.
 *
 * The database is the source of truth. This queue only serializes work for a
 * single build while the process is alive; recover() re-enqueues unfinished
 * rows after a Railway restart.
 */
export class DurableWorkQueue {
  constructor({ execute, onError = async () => {}, logger = null } = {}) {
    if (typeof execute !== 'function') throw new Error('DurableWorkQueue requires an execute function');
    this.execute = execute;
    this.onError = onError;
    this.logger = logger;
    this.chains = new Map();
  }

  enqueue(build, instruction, context = {}) {
    if (!build?.id) throw new Error('A build id is required');
    const previous = this.chains.get(build.id) || Promise.resolve();
    const task = previous
      .catch(() => {})
      .then(() => this.execute(build, instruction, context))
      .catch(async error => {
        await this.onError(error, build, context);
        throw error;
      });

    this.chains.set(build.id, task);
    task.finally(() => {
      if (this.chains.get(build.id) === task) this.chains.delete(build.id);
    }).catch(() => {});
    return task;
  }

  isActive(buildId) {
    return this.chains.has(buildId);
  }

  async recover(loadUnfinished, contextForBuild = () => ({})) {
    if (typeof loadUnfinished !== 'function') throw new Error('recover requires a loader');
    const builds = await loadUnfinished();
    const recovered = [];
    for (const build of builds || []) {
      if (!build?.id || this.isActive(build.id)) continue;
      this.enqueue(build, build.brief, {
        ...contextForBuild(build),
        recovered: true,
      }).catch(error => {
        this.logger?.error?.('Recovered Work execution failed', {
          buildId: build.id,
          error: error.message,
        });
      });
      recovered.push(build.id);
    }
    return recovered;
  }
}

