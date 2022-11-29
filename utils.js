const moment = require('moment');
const { concat, intersection } = require('lodash');
const fs = require('fs');

function calculateNumSlots(s, e, slotLength) {
  // S and e are MOMENT objects
  let minutes = e.hour() * 60 + e.minute() - s.hour() * 60 - s.minute();
  if (e.hour() < s.hour())
    minutes = (e.hour() + 24) * 60 + e.minute() - s.hour() * 60 - s.minute();
  return Math.floor(minutes / slotLength);
}

function defaultSequence(EVENT, offset) {
  const START =
    offset === null
      ? moment(EVENT?.busStart || EVENT.start)
      : moment(EVENT?.busStart || EVENT.start).utcOffset(offset);
  const END =
    offset === null
      ? moment(EVENT?.busEnd || EVENT.end)
      : moment(EVENT?.busEnd || EVENT.end).utcOffset(offset);

  const SLOT_DURATION = EVENT.slot_duration;
  const NUM_SLOTS = calculateNumSlots(START, END, SLOT_DURATION);
  const dateFromIndex = (idx) =>
    START.clone().add(idx * SLOT_DURATION, 'minutes');

  let startIdx = 0;
  let minimum = 3600; // Safe as number of minutes in a day is 24 * 60
  const indices = Array.from(
    {
      length: NUM_SLOTS,
    },
    (x, i) => i,
  );
  for (const idx of indices) {
    const slotStart = dateFromIndex(idx);
    if (slotStart.minute() + 60 * slotStart.hour() < minimum) {
      startIdx = idx;
      minimum = slotStart.minute() + 60 * slotStart.hour();
    }
  }

  const SEQ = indices.splice(startIdx, NUM_SLOTS - startIdx);
  Array.from(
    {
      length: startIdx,
    },
    (x, i) => i,
  ).forEach((val) => SEQ.push(val));
  return SEQ;
}

function generateAsset(EVENT, offset = null) {
  const START =
    offset === null
      ? moment(EVENT?.busStart || EVENT.start)
      : moment(EVENT?.busStart || EVENT.start).utcOffset(offset);
  const END =
    offset === null
      ? moment(EVENT?.busEnd || EVENT.end)
      : moment(EVENT?.busEnd || EVENT.end).utcOffset(offset);

  const SLOT_DURATION = EVENT.slot_duration;
  const DEFAULT_SEQUENCE = defaultSequence(EVENT, offset);
  const FIRST_DAY_LENGTH = getDateSequence(START).length;

  function getDateSequence(DATE) {
    if (DEFAULT_SEQUENCE[0] === 0) return DEFAULT_SEQUENCE;
    const zeroIndex = DEFAULT_SEQUENCE.indexOf(0);
    if (DATE.format('YYYY-MM-DD') === START.format('YYYY-MM-DD'))
      return DEFAULT_SEQUENCE.slice(zeroIndex);
    if (DATE.format('YYYY-MM-DD') === END.format('YYYY-MM-DD'))
      return DEFAULT_SEQUENCE.slice(0, zeroIndex);
    return DEFAULT_SEQUENCE;
  }

  function getDateSlotIds(DATE) {
    const duration = moment.duration(DATE.diff(START));
    const DAYS = Math.ceil(duration.asDays());
    const startId = (DAYS) => {
      if (DAYS === 0) return 0;
      return FIRST_DAY_LENGTH + (DAYS - 1) * DEFAULT_SEQUENCE.length;
    };

    return Array.from(
      {
        length: getDateSequence(DATE).length,
      },
      (x, i) => startId(DAYS) + i,
    );
  }

  function dateIndex(DATE, idx) {
    const time = DATE.clone().add(idx * SLOT_DURATION, 'minutes');
    return DATE.clone().hour(time.hour()).minute(time.minute()).second(0);
  }

  function dateFromSlotId(ID) {
    const calcDays = (id) => {
      if (id < FIRST_DAY_LENGTH) return [0, id];
      let days = 1;
      id -= FIRST_DAY_LENGTH - 1;
      while (id > DEFAULT_SEQUENCE.length) {
        days += 1;
        id -= DEFAULT_SEQUENCE.length;
      }

      return [days, id - 1];
    };

    const [DAYS, INDEX] = calcDays(ID);
    // Const duration = moment.duration(END.diff(START));
    const DATE_ONLY = START.clone().add(DAYS, 'd');
    const SEQ = getDateSequence(DATE_ONLY);
    return dateIndex(DATE_ONLY, SEQ[INDEX]);
  }

  return {
    START,
    END,
    OFFSET: offset,
    DEFAULT_SEQUENCE,
    FIRST_DAY_LENGTH,
    SLOT_DURATION,
    getDateSequence,
    getDateSlotIds,
    dateFromSlotId,
    dateIndex,
  };
}

function getTimeSlot({EVENT, date, REP}) {
  const ASSET = generateAsset(EVENT);

  const DATE = moment(date, 'MM/DD/YYYY')
    .hour(ASSET.START.hour())
    .minute(ASSET.START.minute());

  const appointments = [];
  const DATE_SEQ = ASSET.getDateSequence(DATE);
  const unavailable = concat(
    REP.veto,
    appointments.map((app) => app.slot_id),
  );
  const slotIds = ASSET.getDateSlotIds(DATE);
  const unavailDate = intersection(slotIds, unavailable);
  const availDate = slotIds.filter((id) => !unavailDate.includes(id));
  let j = 0;
  const availArray = [];
  for (let i = 0; i < slotIds.length; ++i)
    if (slotIds[i] === availDate[j]) {
      j += 1;
      availArray.push(DATE_SEQ[i]);
    }

  return availArray.map((val, idx) => {
    return { idx: val, id: availDate[idx], time: ASSET.dateIndex(DATE, val) };
  });
}

function logError({no, errMsg, attendee, timestamp}) {
  const path = `logs/attendee-errors.json`;

  if (!fs.existsSync(path)) fs.writeFileSync(path, '[]');

  const parse = JSON.parse(fs.readFileSync(path));

  attendee.desc = errMsg;

  parse.push(attendee);
  fs.writeFileSync(path, JSON.stringify(parse, null, 2));
  console.error(attendee);
}

function logSuccess({ app }) {
  const path = `logs/attendee-success.json`;

  if (!fs.existsSync(path)) fs.writeFileSync(path, '[]');

  const parse = JSON.parse(fs.readFileSync(path));
  parse.push(app);
  fs.writeFileSync(path, JSON.stringify(parse, null, 2));
}

function logSavePrebooked({ app }) {
  const path = `savePrebooked.json`;

  if (!fs.existsSync(path)) fs.writeFileSync(path, '[]');

  const parse = JSON.parse(fs.readFileSync(path));
  parse.push(app);
  fs.writeFileSync(path, JSON.stringify(parse, null, 2));
}


module.exports = { getTimeSlot, generateAsset, logError, logSuccess, logSavePrebooked };
