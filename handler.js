'use strict';

// see: https://www.binance.com/en/blog/all/get-started-on-bnb-smart-chain-in-60-seconds-421499824684901055
const binanceRpcEndpoint = 'https://bsc-dataseed.binance.org';

// thanks megan!
const babtSmartContract = '0x2b09d47d550061f995a3b5c6f0fd58005215d7c8';

// first 4 bytes of keccak-256 hash of `balanceOf(address)`
// computed with https://emn178.github.io/online-tools/keccak_256.html
const methodSignature = '0x70a08231';

const hasBalance = async (babtAddress) => {
  /*
  see:
  - https://bscscan.com/token/0x2b09d47d550061f995a3b5c6f0fd58005215d7c8#readProxyContract
  - https://docs.soliditylang.org/en/latest/abi-spec.html
  */
  const response = await fetch(
    binanceRpcEndpoint,
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
            to: babtSmartContract,
            data: `${methodSignature}000000000000000000000000${babtAddress.slice(-40)}`
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
