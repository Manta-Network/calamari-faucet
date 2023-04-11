import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { hexToU8a, isHex, stringToU8a, u8aToHex } from '@polkadot/util';
import utils from 'web3-utils';
import * as config from './config.js';

// first 4 bytes of keccak-256 hash
// see: https://emn178.github.io/online-tools/keccak_256.html
// balanceOf(address): 70a08231
// ownerOf(uint256): 6352211e
// totalSupply(): 18160ddd
export const methodSignature = (methodSignatureAsString) => utils.keccak256(methodSignatureAsString).slice(0, 10);

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

export const hasBalance = async (babtAddress) => {
    const balance = await balanceOf(babtAddress);
    // console.log("balance:" + JSON.stringify(balance) + ",has:" + !!balance.result);
    if (balance.result === "0x0000000000000000000000000000000000000000000000000000000000000000") {
        return false
    } else {
        return true
    }
};

export const hasToken = async (babtAddress) => {
    const token = await tokenIdOf(babtAddress);
    // console.log("token:" + JSON.stringify(token) + ",has:" + !!token.result);
    return !!token.result
};

/*
see:
- https://bscscan.com/token/0x2b09d47d550061f995a3b5c6f0fd58005215d7c8#readProxyContract#F3
*/
export const balanceOf = async (babtAddress) => (
    await ethCall(config.endpoint.binance, config.babtSmartContract, 'balanceOf(address)', [babtAddress])
);

export const tokenIdOf = async (babtAddress) => (
    await ethCall(config.endpoint.binance, config.babtSmartContract, 'tokenIdOf(address)', [babtAddress])
);

export const getAccount = async (id) => {
    const { error, result } = await ownerOf(id);
    return {
        id,
        ...(!!result && (result.length === 66)) && {
            address: `0x${result.slice(-40)}`,
        },
        ...(!!error && !!error.code) && { status: error.code },
    };
};

/*
see:
- https://bscscan.com/token/0x2b09d47d550061f995a3b5c6f0fd58005215d7c8#readProxyContract#F9
*/
export const ownerOf = async (tokenId) => (
    await ethCall(config.endpoint.binance, config.babtSmartContract, 'ownerOf(uint256)', [tokenId])
);

// const range = (start, end) => (
//     (end > start)
//         ? [...Array((end - start + 1)).keys()].map((k) => (k + start))
//         : [...Array((start - end + 1)).keys()].map((k) => (k + end)).reverse()
// );

// const discover = async (ids) => {
//     const accounts = await Promise.all(ids.map(getAccount));
//     const updates = await Promise.all(accounts.map(recordAccount))
//     console.log(`${ids[0]} to ${ids.slice(-1)} - discovered: ${accounts.filter((a) => !!a.address).length}, recorded: ${updates.filter((u) => !!u.upsertedCount).length}, updated: ${updates.filter((u) => !!u.modifiedCount).length}`);
//     return {
//         accounts,
//         updates,
//     };
// }