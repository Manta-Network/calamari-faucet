'use strict';

const hasBalance = async (babtAddress) => {
  // todo: implement
  return !!process.env.api_token && true;
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
