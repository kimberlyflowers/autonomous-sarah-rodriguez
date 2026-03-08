// BLOOM Heartbeat Engine - Cron Schedule Configuration
// Defines when and how often the agent should wake up

// Heartbeat frequency configurations
export const cronSchedules = {
  // Main operational heartbeat - every 10 minutes during business hours
  operational: {
    cron: '*/10 * * * *', // Every 10 min, 24/7 — supports sub-hourly tasks like email monitoring
    type: 'full_cycle',
    description: 'Main heartbeat - checks scheduled tasks every 10 min, runs full cycle when tasks are due',
    timezone: 'America/New_York',
    enabled: true
  },

  // Light check - every 2 hours outside business hours
  overnight: {
    cron: '0 */2 * * *', // Every 2 hours
    type: 'light_check',
    description: 'Overnight monitoring for urgent issues only',
    timezone: 'America/New_York',
    enabled: true
  },

  // Weekend light monitoring - every 4 hours
  weekend: {
    cron: '0 */4 * * 0,6', // Every 4 hours on Sat/Sun
    type: 'light_check',
    description: 'Weekend monitoring for urgent issues',
    timezone: 'America/New_York',
    enabled: true
  },

  // Daily summary - every morning at 7:30am
  dailySummary: {
    cron: '30 7 * * 1-5', // 7:30am Mon-Fri
    type: 'daily_summary',
    description: 'Morning briefing for client',
    timezone: 'America/New_York',
    enabled: true
  },

  // Weekly report - Friday at 5pm
  weeklyReport: {
    cron: '0 17 * * 5', // 5pm Friday
    type: 'weekly_report',
    description: 'Weekly performance summary',
    timezone: 'America/New_York',
    enabled: true
  },

  // Monthly graduation check - first Monday of each month at 9am
  graduationCheck: {
    cron: '0 9 1-7 * 1', // First Monday of month at 9am
    type: 'graduation_check',
    description: 'Monthly autonomy level graduation assessment',
    timezone: 'America/New_York',
    enabled: true
  },

  // Health check - every 5 minutes (for monitoring)
  healthCheck: {
    cron: '*/30 * * * *', // Every 30 minutes
    type: 'health_check',
    description: 'System health monitoring',
    timezone: 'America/New_York',
    enabled: true
  }
};

// Schedule variations based on autonomy level
export const autonomyScheduleModifiers = {
  1: { // Observer - more frequent monitoring, less action
    operational: {
      cron: '*/60 8-18 * * 1-5', // Every 60 minutes - don't spam API
      type: 'observation_cycle'
    }
  },

  2: { // Assistant - standard schedule
    operational: {
      cron: '*/30 8-18 * * 1-5', // Every 30 minutes
      type: 'full_cycle'
    }
  },

  3: { // Operator - can handle more autonomously
    operational: {
      cron: '*/45 8-18 * * 1-5', // Every 45 minutes - less supervision needed
      type: 'full_cycle'
    },
    overnight: {
      cron: '0 */3 19-7 * * *', // Every 3 hours - more autonomous overnight
      type: 'autonomous_cycle'
    }
  },

  4: { // Partner - minimal supervision
    operational: {
      cron: '0 */1 8-18 * * 1-5', // Every hour - high autonomy
      type: 'autonomous_cycle'
    },
    overnight: {
      cron: '0 */4 19-7 * * *', // Every 4 hours
      type: 'autonomous_cycle'
    }
  }
};

// Special schedule for holidays (when office is closed)
export const holidaySchedule = {
  lightMonitoring: {
    cron: '0 */6 * * *', // Every 6 hours
    type: 'holiday_check',
    description: 'Holiday monitoring - urgent only'
  }
};

// Get effective schedule for agent's current autonomy level
export function getEffectiveSchedule(autonomyLevel) {
  const baseSchedule = { ...cronSchedules };
  const modifier = autonomyScheduleModifiers[autonomyLevel];

  if (modifier) {
    // Apply autonomy-level modifications
    Object.keys(modifier).forEach(scheduleKey => {
      if (baseSchedule[scheduleKey]) {
        baseSchedule[scheduleKey] = {
          ...baseSchedule[scheduleKey],
          ...modifier[scheduleKey]
        };
      }
    });
  }

  return baseSchedule;
}

// Check if current time is within business hours
export function isBusinessHours() {
  const now = new Date();
  const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));

  const hour = easternTime.getHours();
  const day = easternTime.getDay(); // 0 = Sunday, 6 = Saturday

  // Monday-Friday, 8am-6pm Eastern
  return day >= 1 && day <= 5 && hour >= 8 && hour < 18;
}

// Check if it's a holiday (basic implementation)
export function isHoliday(date = new Date()) {
  const easternDate = new Date(date.toLocaleString("en-US", {timeZone: "America/New_York"}));

  // Basic holiday check - would be enhanced with proper holiday API
  const month = easternDate.getMonth() + 1;
  const day = easternDate.getDate();

  const holidays = [
    '1/1',   // New Year's Day
    '7/4',   // Independence Day
    '12/25', // Christmas
    // Add more holidays as needed
  ];

  const dateStr = `${month}/${day}`;
  return holidays.includes(dateStr);
}

// Get next scheduled run time for a specific schedule
export function getNextRunTime(cronExpression, timezone = 'America/New_York') {
  try {
    // This would use a cron parser library in a real implementation
    // For now, return a simple calculation
    const now = new Date();
    const next = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now
    return next;
  } catch (error) {
    console.error('Failed to calculate next run time:', error);
    return new Date();
  }
}

// Validate cron expression
export function validateCronExpression(cronExpression) {
  // Basic validation - would use proper cron parser in real implementation
  const parts = cronExpression.split(' ');

  if (parts.length < 5 || parts.length > 6) {
    return false;
  }

  // Additional validation would go here
  return true;
}

// Get schedule description in human-readable format
export function getScheduleDescription(scheduleKey) {
  const schedule = cronSchedules[scheduleKey];
  if (!schedule) return 'Unknown schedule';

  return schedule.description;
}

// Override schedules for testing/development
export function applyScheduleOverrides(overrides) {
  Object.keys(overrides).forEach(scheduleKey => {
    if (cronSchedules[scheduleKey]) {
      cronSchedules[scheduleKey] = {
        ...cronSchedules[scheduleKey],
        ...overrides[scheduleKey]
      };
    }
  });
}

// Get all enabled schedules
export function getEnabledSchedules(autonomyLevel = 1) {
  const effectiveSchedule = getEffectiveSchedule(autonomyLevel);

  return Object.entries(effectiveSchedule)
    .filter(([_, config]) => config.enabled)
    .reduce((enabled, [key, config]) => {
      enabled[key] = config;
      return enabled;
    }, {});
}