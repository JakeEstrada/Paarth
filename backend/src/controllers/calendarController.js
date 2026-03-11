const { google } = require('googleapis');
const Job = require('../models/Job');
const Activity = require('../models/Activity');

function formatDateForCalendar(date) {
  return date.toISOString().split('T')[0];
}

// Initialize Google Calendar API
function getCalendarClient() {
  // For now, return null if credentials aren't set up
  // User will need to configure OAuth2 credentials
  const credentials = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET;
  
  if (!credentials) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/calendar/auth/callback'
  );

  // Set credentials if refresh token is available
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });
  }

  return { oauth2Client, calendar: google.calendar({ version: 'v3', auth: oauth2Client }) };
}

// Sync job to Google Calendar
async function syncJobToCalendar(req, res) {
  let jobId;
  try {
    jobId = req.params.jobId;
    const job = await Job.findById(jobId)
      .populate('customerId', 'name primaryPhone primaryEmail');

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!job.schedule?.startDate) {
      return res.status(400).json({ error: 'Job has no start date scheduled' });
    }

    const calendarClient = getCalendarClient();
    if (!calendarClient) {
      return res.status(503).json({ 
        error: 'Google Calendar not configured',
        message: 'Please configure Google Calendar API credentials'
      });
    }

    const { calendar } = calendarClient;
    const startDate = new Date(job.schedule.startDate);
    const endDate = job.schedule.endDate ? new Date(job.schedule.endDate) : startDate;
    
    // Add one day to end date for all-day events
    const eventEndDate = new Date(endDate);
    eventEndDate.setDate(eventEndDate.getDate() + 1);

    // Check if job has recurrence settings
    const recurrence = job.schedule?.recurrence;
    
    const event = {
      summary: job.schedule?.title || job.title,
      description: `Customer: ${job.customerId?.name || 'Unknown'}\nValue: $${job.valueEstimated || 0}`,
      start: {
        date: formatDateForCalendar(startDate),
        timeZone: 'America/Los_Angeles',
      },
      end: {
        date: formatDateForCalendar(eventEndDate),
        timeZone: 'America/Los_Angeles',
      },
    };

    // Add recurrence if specified
    if (recurrence && recurrence.type && recurrence.type !== 'none') {
      const freqMap = {
        daily: 'DAILY',
        weekly: 'WEEKLY',
        monthly: 'MONTHLY',
        yearly: 'YEARLY',
      };
      
      const freq = freqMap[recurrence.type] || 'DAILY';
      const count = recurrence.count || 10; // Default to 10 occurrences
      const interval = recurrence.interval || 1;
      
      event.recurrence = [
        `RRULE:FREQ=${freq};INTERVAL=${interval};COUNT=${count}`
      ];
    }

    // If job already has a Google event ID, update it
    if (job.calendar?.googleEventId) {
      try {
        const updatedEvent = await calendar.events.update({
          calendarId: 'primary',
          eventId: job.calendar.googleEventId,
          resource: event,
        });

        job.calendar.calendarStatus = 'updated';
        job.calendar.lastSyncedAt = new Date();
        await job.save();

        return res.json({ 
          message: 'Job synced to Google Calendar',
          eventId: updatedEvent.data.id,
          event: updatedEvent.data
        });
      } catch (err) {
        if (err.code === 404) {
          return createNewCalendarEvent(job, event, calendar, res);
        }
        if (err.code === 401 || err.code === 403) {
          return res.status(401).json({ 
            error: 'Google Calendar authentication failed',
            message: 'Please re-authenticate with Google Calendar'
          });
        }
        throw err;
      }
    }
    return createNewCalendarEvent(job, event, calendar, res);
  } catch (error) {
    console.error('Error syncing to Google Calendar:', error);
    const code = error.code ?? error.response?.data?.error?.code;
    const message = error.message || (error.response?.data && (error.response.data.message || error.response.data.error)) || 'Google Calendar sync failed';
    
    if (code === 401 || code === 403) {
      return res.status(401).json({ 
        error: 'Google Calendar authentication failed',
        message: 'Please re-authenticate with Google Calendar'
      });
    }
    if (code === 404) {
      return res.status(404).json({ 
        error: 'Calendar event not found',
        message: 'The calendar event may have been deleted'
      });
    }
    
    // Always return JSON 503 so the app can show a friendly message; job is already saved
    return res.status(503).json({ 
      error: 'Google Calendar sync failed',
      message: String(message)
    });
  }
}

async function createNewCalendarEvent(job, event, calendar, res) {
  try {
    const createdEvent = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    job.calendar = {
      googleEventId: createdEvent.data.id,
      calendarStatus: 'created',
      lastSyncedAt: new Date(),
    };
    await job.save();

    // Log activity
    const User = require('../models/User');
    let createdBy = job.createdBy;
    if (!createdBy) {
      const defaultUser = await User.findOne({ isActive: true });
      if (defaultUser) {
        createdBy = defaultUser._id;
      }
    }

    if (createdBy) {
      await Activity.create({
        type: 'calendar_sync',
        jobId: job._id,
        customerId: job.customerId,
        googleEventId: createdEvent.data.id,
        note: 'Job synced to Google Calendar',
        createdBy: createdBy
      });
    }

    res.json({ 
      message: 'Job synced to Google Calendar',
      eventId: createdEvent.data.id,
      event: createdEvent.data
    });
  } catch (error) {
    console.error('Error creating Google Calendar event:', error);
    const message = error.message || (error.response?.data && (error.response.data.message || error.response.data.error)) || 'Google Calendar sync failed';
    return res.status(503).json({ 
      error: 'Google Calendar sync failed',
      message: String(message)
    });
  }
}

// Delete job from Google Calendar
async function deleteJobFromCalendar(req, res) {
  try {
    const { jobId } = req.params;
    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!job.calendar?.googleEventId) {
      return res.status(400).json({ error: 'Job is not synced to Google Calendar' });
    }

    const calendarClient = getCalendarClient();
    if (!calendarClient) {
      return res.status(503).json({ error: 'Google Calendar not configured' });
    }

    const { calendar } = calendarClient;

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: job.calendar.googleEventId,
    });

    job.calendar.calendarStatus = 'none';
    job.calendar.googleEventId = null;
    await job.save();

    res.json({ message: 'Job removed from Google Calendar' });
  } catch (error) {
    console.error('Error deleting from Google Calendar:', error);
    res.status(500).json({ error: error.message });
  }
}

// Get Google Calendar auth URL
async function getAuthUrl(req, res) {
  try {
    const calendarClient = getCalendarClient();
    if (!calendarClient) {
      return res.status(503).json({ error: 'Google Calendar not configured' });
    }

    const { oauth2Client } = calendarClient;
    const scopes = ['https://www.googleapis.com/auth/calendar'];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
    });

    res.json({ authUrl: url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Handle OAuth callback
async function handleAuthCallback(req, res) {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'No authorization code provided' });
    }

    const calendarClient = getCalendarClient();
    if (!calendarClient) {
      return res.status(503).json({ error: 'Google Calendar not configured' });
    }

    const { oauth2Client } = calendarClient;
    const { tokens } = await oauth2Client.getToken(code);

    res.json({ 
      message: 'Authorization successful',
      refreshToken: tokens.refresh_token,
      note: 'Add this refresh_token to your .env file as GOOGLE_REFRESH_TOKEN'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  syncJobToCalendar,
  deleteJobFromCalendar,
  getAuthUrl,
  handleAuthCallback
};

