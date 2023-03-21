'use strict';

const hasBalance = async (babtAddress) => {
  const response = await fetch(
    'https://bsc-dataseed.binance.org',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [
          {
            to: '0x2b09d47d550061f995a3b5c6f0fd58005215d7c8',
            data: `0x70a08231000000000000000000000000${babtAddress.slice(-40)}`
          },
          'latest'
        ]
      },
    }
  );
  const json = await response.json();
  return !!json.result;
};

const hasPriorDrip = async (babtAddress, kmaAddress) => {
  // todo: implement
  return false;
};

const dripNow = async (kmaAddress) => {
  // todo: implement
  return !!process.env.api_token && true;
};

export const drip = async (event) => {
  const { babtAddress, kmaAddress } = event.pathParameters;
  const eligible = ((await hasBalance(babtAddress)) && !(await hasPriorDrip(babtAddress, kmaAddress)));
  return {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
      'Content-Type': 'application/json',
    },
    statusCode: 200,
    body: JSON.stringify(
      {
        status: (!eligible)
          ? 'ineligible'
          : (await dripNow(kmaAddress))
            ? 'success'
            : 'fail',
      },
      null,
      2 
    ),
  };
};
