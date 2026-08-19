const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');
const moment = require('moment-timezone');

const formatAmount = (amountStr) => {
  return Number(amountStr.replace(/[Rp,\s]/g, ''));
};

const convertUtcIsoToTimezoneWithOffset = (isoUtcStr, timezoneStr) => {
  const utcMoment = moment.tz(isoUtcStr, 'UTC');

  const convertedMoment = utcMoment.clone().tz(timezoneStr);

  const offsetMinutes = convertedMoment.utcOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const hours = Math.floor(absOffset / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (absOffset % 60).toString().padStart(2, '0');
  const offsetStr = `${sign}${hours}:${minutes}`;

  return {
    datetime: convertedMoment.format(), // ISO8601 with timezone
    offset: offsetStr,
  };
};

const migrate = () => {
  const url = 'http://127.0.0.1:3000/api/transaction';
  const bearerToken = 'YOUR_BEARER_TOKEN_HERE';

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${bearerToken}`,
  };

  fs.createReadStream('transactions.csv')
    .pipe(csv())
    .on('data', async (row) => {
      const amount = formatAmount(row['Amount']);
      const type = row['Type'].toLowerCase();
      const time = row['Timestamp'];
      const timezone = 'Asia/Jakarta';


      const payload = {
        description: row['Title'],
        category: row['Category'],
        amount,
        currency: 'idr',
        type,
        time,
        transaction_timezone: timezone,
      };

      try {
        const response = await axios.post(url, payload, { headers });
        if (response.status === 201) {
          console.log(`Added transaction: ${payload.description}`);
        } else {
          console.log(
            `Failed to add ${payload.description}: ${response.status}`
          );
        }
      } catch (err) {
        console.error(
          `Error adding ${payload.description}:`,
          err.response ? err.response.data : err.message
        );
      }
    })
    .on('end', () => {
      console.log('CSV processing completed.');
    });
};

const exampleUtc = '2025-09-27T11:49:49.000+00:00';
const { datetime: jakartaTime, offset: jakartaOffset } =
  convertUtcIsoToTimezoneWithOffset(exampleUtc, 'Asia/Jakarta');
console.log('Jakarta time:', jakartaTime);
console.log('UTC offset:', jakartaOffset);

// migrate();  // uncomment to run
