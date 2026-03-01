// BLOOM Heartbeat Engine - Email Integration
// Handles email operations for agent notifications and communication

import nodemailer from 'nodemailer';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('email');

class EmailClient {
  constructor() {
    this.smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    this.smtpPort = process.env.SMTP_PORT || 587;
    this.smtpUser = process.env.SMTP_USER;
    this.smtpPassword = process.env.SMTP_PASSWORD;
    this.fromEmail = process.env.FROM_EMAIL || 'agents@bloomiestaffing.com';
    this.fromName = process.env.FROM_NAME || 'BLOOM Agent';

    this.transporter = null;
    this.isConfigured = !!(this.smtpUser && this.smtpPassword);

    if (!this.isConfigured) {
      logger.warn('Email not fully configured - will use fallback methods');
    } else {
      this.initializeTransporter();
    }
  }

  // Initialize SMTP transporter
  initializeTransporter() {
    try {
      this.transporter = nodemailer.createTransporter({
        host: this.smtpHost,
        port: this.smtpPort,
        secure: this.smtpPort === 465, // true for 465, false for other ports
        auth: {
          user: this.smtpUser,
          pass: this.smtpPassword
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      logger.info('✅ Email transporter initialized', {
        host: this.smtpHost,
        port: this.smtpPort,
        user: this.smtpUser
      });

    } catch (error) {
      logger.error('❌ Failed to initialize email transporter:', error.message);
      this.isConfigured = false;
    }
  }

  // Test email connection
  async testConnection() {
    if (!this.isConfigured || !this.transporter) {
      logger.warn('Email not configured for connection test');
      return false;
    }

    try {
      await this.transporter.verify();
      logger.info('✅ Email connection test successful');
      return true;
    } catch (error) {
      logger.error('❌ Email connection test failed:', error.message);
      return false;
    }
  }

  // Send email
  async sendEmail(emailData) {
    const {
      to,
      from = this.fromEmail,
      fromName = this.fromName,
      subject,
      body,
      html,
      attachments = []
    } = emailData;

    // If SMTP is configured, use it
    if (this.isConfigured && this.transporter) {
      return await this.sendViaSMTP(emailData);
    }

    // Otherwise, try GHL email as fallback
    return await this.sendViaGHL(emailData);
  }

  // Send via SMTP
  async sendViaSMTP(emailData) {
    const {
      to,
      from = this.fromEmail,
      fromName = this.fromName,
      subject,
      body,
      html,
      attachments = []
    } = emailData;

    try {
      const mailOptions = {
        from: `${fromName} <${from}>`,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        text: body,
        html: html || this.convertTextToHTML(body),
        attachments
      };

      logger.info('Sending email via SMTP...', {
        to: mailOptions.to,
        subject,
        from: mailOptions.from
      });

      const result = await this.transporter.sendMail(mailOptions);

      logger.info('✅ Email sent successfully via SMTP', {
        messageId: result.messageId,
        to: mailOptions.to,
        subject
      });

      return {
        success: true,
        messageId: result.messageId,
        method: 'SMTP',
        to: mailOptions.to
      };

    } catch (error) {
      logger.error('❌ Failed to send email via SMTP:', error.message);
      throw error;
    }
  }

  // Send via GHL as fallback
  async sendViaGHL(emailData) {
    try {
      const { ghlClient } = await import('./ghl.js');

      logger.info('Attempting to send email via GHL fallback...');

      // Try to find contact by email to send via GHL
      const contacts = await ghlClient.getRecentContacts(24);
      const contact = contacts.find(c => c.email === emailData.to);

      if (contact) {
        return await ghlClient.sendEmail({
          contactId: contact.id,
          subject: emailData.subject,
          templateId: 'custom_template',
          personalization: {
            custom_message: emailData.body
          }
        });
      }

      // If no contact found, log and return failure
      logger.warn('No GHL contact found for email, cannot send via fallback');

      throw new Error('No email method available');

    } catch (error) {
      logger.error('❌ Failed to send email via GHL fallback:', error.message);
      throw error;
    }
  }

  // Check for incoming emails (placeholder)
  async checkInbox() {
    // This would integrate with IMAP or email API
    logger.info('Email inbox check (placeholder)');

    return {
      unread: [],
      urgent: [],
      fromClients: [],
      spam: []
    };
  }

  // Send agent escalation notification
  async sendEscalationNotification(recipient, agentName, issue, urgency, details) {
    const subject = `${urgency} Agent Escalation: ${agentName}`;

    const body = `AGENT ESCALATION NOTIFICATION

Agent: ${agentName}
Issue: ${issue}
Urgency: ${urgency}
Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST

Details:
${details}

This is an automated notification from the BLOOM autonomous agent system.
Please review and take appropriate action.

---
BLOOM Staffing Agent System
`;

    try {
      await this.sendEmail({
        to: recipient,
        subject,
        body,
        fromName: `${agentName} (BLOOM Agent)`
      });

      logger.info('✅ Escalation notification sent', {
        recipient,
        agentName,
        urgency
      });

      return true;

    } catch (error) {
      logger.error('❌ Failed to send escalation notification:', error.message);
      throw error;
    }
  }

  // Send daily summary
  async sendDailySummary(recipient, agentName, summaryData) {
    const subject = `Daily Summary: ${agentName} - ${new Date().toLocaleDateString()}`;

    const body = this.formatDailySummary(agentName, summaryData);

    try {
      await this.sendEmail({
        to: recipient,
        subject,
        body,
        html: this.convertSummaryToHTML(agentName, summaryData),
        fromName: `${agentName} (BLOOM Agent)`
      });

      logger.info('✅ Daily summary sent', {
        recipient,
        agentName
      });

      return true;

    } catch (error) {
      logger.error('❌ Failed to send daily summary:', error.message);
      throw error;
    }
  }

  // Send weekly report
  async sendWeeklyReport(recipient, agentName, reportData) {
    const subject = `Weekly Report: ${agentName} - Week of ${new Date().toLocaleDateString()}`;

    const body = this.formatWeeklyReport(agentName, reportData);

    try {
      await this.sendEmail({
        to: recipient,
        subject,
        body,
        html: this.convertReportToHTML(agentName, reportData),
        fromName: `${agentName} (BLOOM Agent)`
      });

      logger.info('✅ Weekly report sent', {
        recipient,
        agentName
      });

      return true;

    } catch (error) {
      logger.error('❌ Failed to send weekly report:', error.message);
      throw error;
    }
  }

  // Format daily summary text
  formatDailySummary(agentName, data) {
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York'
    });

    return `Good morning!

Here's your daily summary from ${agentName} for ${date}:

📊 ACTIVITY OVERVIEW
• Heartbeat Cycles: ${data.cycles || 0}
• Actions Taken: ${data.actions || 0}
• Issues Escalated: ${data.escalations || 0}
• Rejections (Good Decisions): ${data.rejections || 0}

🎯 KEY ACCOMPLISHMENTS
${data.accomplishments?.map(item => `• ${item}`).join('\n') || '• Monitoring operations successfully'}

🚨 ESCALATIONS & ALERTS
${data.alerts?.map(alert => `• ${alert.type}: ${alert.message}`).join('\n') || '• No escalations required'}

📈 PERFORMANCE METRICS
• Cycle Success Rate: ${data.successRate || 100}%
• Average Response Time: ${data.avgResponseTime || 'N/A'}
• System Uptime: ${data.uptime || '100%'}

🔄 UPCOMING PRIORITIES
• Next business hours monitoring at 8:00 AM
• Continued enrollment inquiry responses
• Follow-up reminders as scheduled

Have a great day!

---
${agentName}
BLOOM Autonomous Agent
Generated at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`;
  }

  // Format weekly report text
  formatWeeklyReport(agentName, data) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday

    return `Weekly Operations Report from ${agentName}

Week of ${weekStart.toLocaleDateString()} - ${new Date().toLocaleDateString()}

📊 WEEKLY SUMMARY
• Total Heartbeat Cycles: ${data.totalCycles || 0}
• Total Actions: ${data.totalActions || 0}
• Total Escalations: ${data.totalEscalations || 0}
• System Uptime: ${data.uptime || '100%'}

🎯 MAJOR ACCOMPLISHMENTS
${data.weeklyAccomplishments?.map(item => `• ${item}`).join('\n') || '• Consistent monitoring and operations'}

📈 PERFORMANCE TRENDS
• Action Success Rate: ${data.actionSuccessRate || 100}%
• Escalation Rate: ${data.escalationRate || 0}%
• Response Time: ${data.avgResponseTime || 'N/A'}

🔍 INSIGHTS & PATTERNS
${data.insights?.map(insight => `• ${insight}`).join('\n') || '• Operations running smoothly'}

🚀 AUTONOMY PROGRESSION
• Current Level: ${data.autonomyLevel || 1} (${data.autonomyLevelName || 'Observer'})
• Trust Score: ${data.trustScore || 'Building'}
• Graduation Progress: ${data.graduationProgress || 'On track'}

📅 NEXT WEEK PRIORITIES
• Continue monitoring enrollment inquiries
• Maintain follow-up schedules
• Build trust for potential autonomy graduation

---
${agentName}
BLOOM Autonomous Agent
Report generated ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`;
  }

  // Convert text to HTML
  convertTextToHTML(text) {
    if (!text) return '';

    return text
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>')
      .replace(/•/g, '&bull;')
      .replace(/📊|🎯|🚨|📈|🔄|🔍|🚀|📅/g, '<strong>$&</strong>');
  }

  // Convert summary to HTML
  convertSummaryToHTML(agentName, data) {
    // This would create a nicely formatted HTML email
    // For now, just convert the text version
    return this.convertTextToHTML(this.formatDailySummary(agentName, data));
  }

  // Convert report to HTML
  convertReportToHTML(agentName, data) {
    // This would create a nicely formatted HTML email
    // For now, just convert the text version
    return this.convertTextToHTML(this.formatWeeklyReport(agentName, data));
  }
}

// Create and export singleton instance
export const emailClient = new EmailClient();