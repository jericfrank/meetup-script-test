require('dotenv').config();

// const fs = require('fs');
const axios = require('axios');
const moment = require('moment');

const { getTimeSlot, logSavePrebooked } = require('./utils');

const attendees = require('./attendees.json');
const prebooked = require('./prebooked.json');

axios.defaults.baseURL = process.env.MEETUP_API_URL;

const EVENT_ID = process.env.MEETUP_EVENT_ID;
const LOCALE = process.env.LOCALE;

(async function () {

  for (let i = 0; i < prebooked.length; i++) {
    console.log(i);
    const prebook = prebooked[i];

    // get attendee details inviter, invitee
    const inviterData = attendees.find(a => (a['invitation_email'] || '').toLocaleLowerCase() === prebook.inviter.toLocaleLowerCase() || (a['user_id'] || '').toLocaleLowerCase() === prebook.inviter.toLocaleLowerCase());
    const inviteeData = attendees.find(a => (a['invitation_email'] || '').toLocaleLowerCase() === prebook.invitee.toLocaleLowerCase() || (a['user_id'] || '').toLocaleLowerCase() === prebook.invitee.toLocaleLowerCase());

    const inviter = {
      id: inviterData.id,
      email: inviterData['invitation_email'] || inviterData['user_id'],
      ...JSON.parse(inviterData.meetup_config),
    };
    inviter.name = inviterData.name || inviter.email;

    const invitee = {
      id: inviteeData.id,
      email: inviteeData['invitation_email'] || inviteeData['user_id'],
      ...JSON.parse(inviteeData.meetup_config),
    };
    invitee.name = inviteeData.name || invitee.email;

    // get event meetup details
    const { data: event } = await axios.get(`/get/event/${EVENT_ID}`);
    const EVENT = event.data;

    // get representative details
    const { data: rep } = await axios.get(`/get_all/representative/${inviter.exhibitorId}`);
    const REP = rep.data[0];

    // filter out confirmed appointments
    const formatDate = `${prebook.date} ${prebook.time}`;
    const timeslot = getTimeSlot({EVENT, date: prebook.date, REP});
    const date = moment(formatDate, 'MM/DD/YYYY hh:mm:ss aa');

    const selectedDate = timeslot.find(t => date.isSame(t.time));
    const confirmAppointments = REP.confirmed || [];
    const exists = confirmAppointments.find(c => c.slot_id === selectedDate.id);

    if (exists) {
      const { data: app } = await axios.get(`get/appointment/${exists.app_id}`);
      if (app.data.ex_id === invitee.exhibitorId) {
        prebook.app_id = app.data.id;
        prebook.inviter_name = inviter.name;
        prebook.invitee_name = invitee.name;
        prebook.inviter_agenda_url = `https://meetup.eventx.io/exhibitor/${inviter.exhibitorId}?auth_token=${inviter.exhibitorAuthToken}`;
        prebook.invitee_agenda_url = `https://meetup.eventx.io/exhibitor/${invitee.exhibitorId}?auth_token=${invitee.exhibitorAuthToken}`;

        console.log(prebook);
        logSavePrebooked({ app: prebook });
      } else {
        console.log('1');
        return;
        // logSavePrebooked({ app: prebook });
      }
    } else {
      try {
        const startTime = selectedDate.time;
        const endTime = selectedDate.time.clone().add(
          EVENT.slot_duration,
          'minutes',
        );
        const appParams = {
          attendeeUuid: inviter.id,
          attendeeRepId: inviter.representativeId,
          attendeeExId: inviter.exhibitorId,
          name: inviter.name,
          last: '',
          first: '',
          email: inviter.email,
          title: inviter.job_title || '',
          company: inviter.organization || '',
          notes: '',
          method: 'DEFAULT',
          slot_id: selectedDate.id,
          ex_id: invitee.exhibitorId,
          rep_id: invitee.representativeId,
          isCancelDisabled: true,
          isPreBooked: true,
          start: startTime.valueOf(),
          end: endTime.valueOf(),
          zone: prebook.zone,
          locale: LOCALE,
        };
        const { data: app } = await axios.post('/create/appointment', { ...appParams });
  
        console.log('app', app);
        prebook.app_id = app.id;
        prebook.inviter_name = inviter.name;
        prebook.invitee_name = invitee.name;
        prebook.inviter_agenda_url = `https://meetup.eventx.io/exhibitor/${inviter.exhibitorId}?auth_token=${inviter.exhibitorAuthToken}`;
        prebook.invitee_agenda_url = `https://meetup.eventx.io/exhibitor/${invitee.exhibitorId}?auth_token=${invitee.exhibitorAuthToken}`;
  
        console.log(prebook);
        logSavePrebooked({ app: prebook });
      } catch (e) {
        console.log('2', e, prebook);
        return;
      }
    }
  }

})();
