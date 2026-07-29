import { executeDeveloperTool } from '../src/tools/developer-tools.js';

const organizationId = 'b2000000-0000-0000-0000-000000000002';
const teamId = 'team_Pfa8x7Xsw8uZDAP1OI4QSSG7';

const github = await executeDeveloperTool(
  'github_list_repositories',
  { per_page: 100 },
  organizationId,
);

const vercel = await executeDeveloperTool(
  'vercel_list_projects',
  { teamId, limit: 100 },
  organizationId,
);

const fileCheck = await executeDeveloperTool(
  'github_get_file',
  {
    owner: 'kimberlyflowers',
    repo: 'youth-empowerment-school',
    path: 'bloomie-verification/jonathan-vercel-edit-test.txt',
    ref: 'main',
  },
  organizationId,
);

const deployments = await executeDeveloperTool(
  'vercel_list_deployments',
  {
    teamId,
    projectId: 'prj_OUek66OhWNRUtyaBQe54OBgJWwwt',
    limit: 10,
  },
  organizationId,
);

console.log(JSON.stringify({ github, vercel, fileCheck, deployments }, null, 2));
