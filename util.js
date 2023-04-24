import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { hexToU8a, isHex } from '@polkadot/util';
import utils from 'web3-utils';
import * as config from './config.js';

export const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
    'Content-Type': 'application/json',
};

export const isValidEthAddress = (ethAddress) => {
    return /^(0x)?[0-9a-f]{40}$/i.test(ethAddress);
}

export const isValidSubstrateAddress = (address) => {
    try {
        encodeAddress(
            isHex(address)
                ? hexToU8a(address)
                : decodeAddress(address)
        );
        return true;
    } catch (error) {
        return false;
    }
};

// first 4 bytes of keccak-256 hash
// see: https://emn178.github.io/online-tools/keccak_256.html
// balanceOf(address): 70a08231
// ownerOf(uint256): 6352211e
// totalSupply(): 18160ddd
export const methodSignature = (methodSignatureAsString) => utils.keccak256(methodSignatureAsString).slice(0, 10);

/*
see:
- https://docs.soliditylang.org/en/latest/abi-spec.html
- https://www.quicknode.com/docs/ethereum/eth_call
*/
export const ethCall = async (endpoint, contract, method, parameters = [], tag = 'latest') => {
    const params = [
        {
            to: contract,
            data: `${methodSignature(method)}${parameters.map((p) => {
                // utils.padLeft(utils.hexToBytes(address), 32)
                const x = utils.padLeft(p, 64);
                return x.startsWith('0x')
                    ? x.slice(2)
                    : x;
            }).join('')}`
        },
        tag
    ];
    const response = await fetch(
        endpoint,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_call',
                params
            }),
        }
    );
    const json = await response.json();
    //console.log({ endpoint, contract, method, parameters, tag, params, json });
    return json;
};

export const hasBalance = async (mintType, ethAddress) => {
    const balance = await balanceOf(mintType, ethAddress);
    // console.log("balance:" + JSON.stringify(balance) + ",has:" + !!balance.result);
    if (balance.result === "0x0000000000000000000000000000000000000000000000000000000000000000") {
        return false
    } else {
        return true
    }
};

export const balanceOf = async (mintType, babtAddress) => {
    const endpoint = config.endpoint[config.chains[mintType]];
    // console.log("mintType:" + mintType + ",chains:" + config.chains[mintType] + ",endpoint:" + endpoint);
    return await ethCall(endpoint, config.contracts[mintType], 'balanceOf(address)', [babtAddress]);
};

export const tokenIdOf = async (mintType, babtAddress) => {
    const endpoint = config.endpoint[config.chains[mintType]];
    return await ethCall(endpoint, config.contracts[mintType], config.tokenCallName[mintType], [babtAddress]);
};
