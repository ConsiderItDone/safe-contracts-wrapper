import { BigInt, Box } from "@polywrap/wasm-as";
import { SafeTransaction, Ethereum_Module } from "./wrap";
import { SafeTransactionData } from "./wrap/SafeTransactionData";

export const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

export function isHexString(value: string): boolean {
  if (typeof value != "string" || value.startsWith("0x")) {
    return false;
  }
  return true;
}

export function getTransactionHashArgs(
  tx: SafeTransactionData,
  nonce: u32
): string[] {
  /*   let safeTxGas = BigInt.from("0");
  let baseGas = BigInt.from("0");
  let gasPrice = BigInt.from("0");
  let gasToken = ZERO_ADDRESS;
  let refundReceiver = ZERO_ADDRESS;

  let operation = 0;
  if (tx.operation != null) {
    operation = tx.operation!.unwrap();
  }

  //TODO check if bigints and != 0
  if (tx.safeTxGas != null) {
    safeTxGas = tx.safeTxGas!;
  }
  if (tx.baseGas) {
    baseGas = tx.baseGas!;
  }
  if (tx.gasPrice) {
    gasPrice = tx.gasPrice!;
  }
  if (tx.gasToken != null) {
    gasToken = tx.gasToken!;
  }
  if (tx.refundReceiver != null) {
    refundReceiver = tx.refundReceiver!;
  } */

  return [
    tx.to,
    tx.value,
    tx.data,
    tx.operation!.unwrap().toString(),
    tx.safeTxGas!.unwrap().toString(),
    tx.baseGas!.unwrap().toString(),
    tx.gasPrice!.unwrap().toString(),
    tx.gasToken!,
    tx.refundReceiver!,
    nonce.toString(),
  ];
}

export function arrayify(value: string): Uint8Array {
  let hex = value.substring(2);

  let result = new Array<u8>();

  for (let i = 0; i < hex.length; i += 2) {
    result.push(<u8>parseInt(hex.substring(i, i + 2), 16));
  }
  const uArray = new Uint8Array(result.length);
  uArray.set(result);
  return uArray;
}

export function sameString(str1: string, str2: string): boolean {
  return str1.toLowerCase() === str2.toLowerCase();
}
/*
function calculateSigRecovery(v: BNLike, chainId?: BNLike): BN {
  const vBN = toType(v, TypeOutput.BN);
  if (!chainId) {
    return vBN.subn(27);
  }
  const chainIdBN = toType(chainId, TypeOutput.BN);
  return vBN.sub(chainIdBN.muln(2).addn(35));
}

 export const ecrecover = function(
  msgHash: Buffer,
  v: BigInt,
  r: Buffer,
  s: Buffer,
): Buffer {
  const signature = Buffer.concat([setLengthLeft(r, 32), setLengthLeft(s, 32)], 64)
  const recovery = calculateSigRecovery(v, chainId)
  if (!isValidSigRecovery(recovery)) {
    throw new Error('Invalid signature v value')
  }
  const senderPubKey = ecdsaRecover(signature, recovery.toNumber(), msgHash)
  return Buffer.from(publicKeyConvert(senderPubKey, false).slice(1))
}

export function isTxHashSignedWithPrefix(
  txHash: string,
  signature: string,
  ownerAddress: string
): boolean {
  let hasPrefix: boolean;
  //try {
  const rsvSig = {
    r: Buffer.from(signature.slice(2, 66), "hex"),
    s: Buffer.from(signature.slice(66, 130), "hex"),
    v: BigInt.from(parseInt(signature.slice(130, 132), 16)),
  };
  const recoveredData = ecrecover(
    Buffer.from(txHash.slice(2), "hex"),
    rsvSig.v,
    rsvSig.r,
    rsvSig.s
  );
  const recoveredAddress = bufferToHex(pubToAddress(recoveredData));
  hasPrefix = !sameString(recoveredAddress, ownerAddress);
  //} catch (e) {
  //  hasPrefix = true;
  //}
  return hasPrefix;
} */

export const adjustVInSignature = (
  signingMethod: string, //"eth_sign" | "eth_signTypedData",
  signature: string,
  safeTxHash: string,
  signerAddress: string
): string => {
  const ETHEREUM_V_VALUES: Array<u8> = [0, 1, 27, 28];
  const MIN_VALID_V_VALUE_FOR_SAFE_ECDSA: u8 = 27;
  let signatureV: u8 = U8.parseInt(signature.slice(-2), 16);
  if (!ETHEREUM_V_VALUES.includes(signatureV)) {
    throw new Error("Invalid signature");
  }
  if (signingMethod == "eth_sign") {
    /*
      The Safe's expected V value for ECDSA signature is:
      - 27 or 28
      - 31 or 32 if the message was signed with a EIP-191 prefix. Should be calculated as ECDSA V value + 4
      Some wallets do that, some wallets don't, V > 30 is used by contracts to differentiate between
      prefixed and non-prefixed messages. The only way to know if the message was signed with a
      prefix is to check if the signer address is the same as the recovered address.
      More info:
      https://docs.gnosis-safe.io/contracts/signatures
    */
    if (signatureV < MIN_VALID_V_VALUE_FOR_SAFE_ECDSA) {
      signatureV += MIN_VALID_V_VALUE_FOR_SAFE_ECDSA;
    }
    const adjustedSignature = signature.slice(0, -2) + signatureV.toString(16);
    /* 
    const signatureHasPrefix = isTxHashSignedWithPrefix(
      safeTxHash as string,
      adjustedSignature,
      signerAddress as string
    ); */
    const signatureHasPrefix = true;

    if (signatureHasPrefix) {
      signatureV += 4;
    }
  }
  if (signingMethod == "eth_signTypedData") {
    // Metamask with ledger returns V=0/1 here too, we need to adjust it to be ethereum's valid value (27 or 28)
    if (signatureV < MIN_VALID_V_VALUE_FOR_SAFE_ECDSA) {
      signatureV += MIN_VALID_V_VALUE_FOR_SAFE_ECDSA;
    }
  }
  signature = signature.slice(0, -2) + signatureV.toString(16);
  return signature;
};

export const createTransactionFromPartial = (
  transactionData: SafeTransactionData
): SafeTransactionData => {
  // TODO: if args.tx.data is parsed as an array, create multisend tx
  // let value: Box<u32> = args.tx.value != null ? args.tx.value : <u32>0;

  if (transactionData.baseGas == null) {
    transactionData.baseGas = Box.from(<u32>0);
  }

  if (transactionData.gasPrice == null) {
    transactionData.gasPrice = Box.from(<u32>0);
  }

  if (transactionData.safeTxGas == null) {
    transactionData.safeTxGas = Box.from(<u32>0);
  }

  if (transactionData.operation == null) {
    transactionData.operation = Box.from(<u8>0); // 0 is Call, 1 is DelegateCall
  }

  if (transactionData.gasToken == null) {
    transactionData.gasToken = ZERO_ADDRESS;
  }

  if (transactionData.refundReceiver == null) {
    transactionData.refundReceiver = ZERO_ADDRESS;
  }

  return transactionData;
};