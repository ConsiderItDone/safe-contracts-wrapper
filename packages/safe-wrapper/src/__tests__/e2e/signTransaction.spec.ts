import path from "path";
import { PolywrapClient } from "@polywrap/client-js";
import {
  initTestEnvironment,
  stopTestEnvironment,
  providers,
  ensAddresses,
} from "@polywrap/test-env-js";
import * as App from "../types/wrap";
import { getPlugins, setupContractNetworks } from "../utils";
import Safe from "@gnosis.pm/safe-core-sdk";
import {
  SafeTransactionDataPartial,
  EthAdapter,
} from "@gnosis.pm/safe-core-sdk-types";
import EthersAdapter, { EthersAdapterConfig } from "@gnosis.pm/safe-ethers-lib";
import { ethers, Wallet } from "ethers";
import { Signer } from "@ethersproject/abstract-signer";

import { abi as factoryAbi_1_3_0 } from "@gnosis.pm/safe-contracts_1.3.0/build/artifacts/contracts/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json";

import { abi as safeAbi_1_3_0 } from "@gnosis.pm/safe-contracts_1.3.0/build/artifacts/contracts/GnosisSafe.sol/GnosisSafe.json";

import { abi as multisendAbi } from "@gnosis.pm/safe-contracts_1.3.0/build/artifacts/contracts/libraries/MultiSend.sol/MultiSend.json";

import { abi as multisendCallOnlyAbi } from "@gnosis.pm/safe-contracts_1.3.0/build/artifacts/contracts/libraries/MultiSendCallOnly.sol/MultiSendCallOnly.json";
//import { SafeWrapper_SafeTransaction } from "../types/wrap";
import { Client } from "@polywrap/core-js";
//@ts-ignore
import { zeroAddress } from "ethereumjs-util";
import { SafeTransaction, SafeTransactionData } from "../../wrap";

jest.setTimeout(1200000);

describe("Safe Wrapper", () => {
  const wallet = new Wallet(
    "0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d"
  );

  const signer = "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1";

  //const ethereumUri = "ens/ethereum.polywrap.eth";
  let safeAddress: string;

  let client: Client;
  const wrapperPath: string = path.join(
    path.resolve(__dirname),
    "..",
    "..",
    ".."
  );
  const wrapperUri = `fs/${wrapperPath}/build`;

  let proxyContractAddress: string;
  let safeContractAddress: string;
  let multisendAddress: string;
  let multisendCallOnlyAddress: string;

  const ethersProvider = new ethers.providers.JsonRpcProvider(
    providers.ethereum
  );

  const connection = { networkNameOrChainId: "testnet" };

  beforeAll(async () => {
    await initTestEnvironment();

    const network = await ethersProvider.getNetwork();

    connection.networkNameOrChainId = network.chainId.toString();

    const plugins = await getPlugins(
      providers.ethereum,
      providers.ipfs,
      ensAddresses.ensAddress,
      ethersProvider
    );

    client = new PolywrapClient({
      ...plugins,
    }) as unknown as Client;

    [
      safeAddress,
      {
        proxyContractAddress,
        safeContractAddress,
        multisendAddress,
        multisendCallOnlyAddress,
      },
    ] = await setupContractNetworks(client);

    client = new PolywrapClient({
      ...plugins,
      envs: [
        {
          uri: wrapperUri,
          env: {
            safeAddress: safeAddress,
            connection: connection,
          },
        },
      ],
    }) as unknown as Client;
  });

  afterAll(async () => {
    await stopTestEnvironment();
  });

  describe("SignTransaction", () => {
    const setupTests = async () => {
      return {
        accounts: [
          {
            signer: wallet,
            address: signer,
          },
        ],
        contractNetworks: {
          [(await ethersProvider.getNetwork()).chainId]: {
            multiSendAddress: multisendAddress,
            multiSendAbi: multisendAbi,
            multiSendCallOnlyAddress: multisendCallOnlyAddress,
            multiSendCallOnlyAbi: multisendCallOnlyAbi,
            safeMasterCopyAddress: safeContractAddress,
            safeMasterCopyAbi: safeAbi_1_3_0,
            safeProxyFactoryAddress: proxyContractAddress,
            safeProxyFactoryAbi: factoryAbi_1_3_0,
          },
        },
      };
    };

    const getEthAdapter = async (signer: Signer): Promise<EthAdapter> => {
      let ethAdapter: EthAdapter;
      signer = signer.connect(ethersProvider);
      const ethersAdapterConfig: EthersAdapterConfig = { ethers, signer };
      ethAdapter = new EthersAdapter(ethersAdapterConfig);
      return ethAdapter;
    };

    it("Should create SDK-like transaction based on full transaction data ", async () => {
      const { accounts, contractNetworks } = await setupTests();
      const [account1] = accounts;
      const ethAdapter = await getEthAdapter(account1.signer);

      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress: safeAddress,
        //@ts-ignore
        contractNetworks,
      });

      const nonce = (await ethAdapter.getNonce(account1.address)) + 1;

      const safeTransactionData = {
        to: account1.address,
        value: "500000000000000000", // 0.5 ETH
        data: "0x00",
        baseGas: 111,
        gasPrice: 453,
        gasToken: "0x333",
        refundReceiver: "0x444",
        safeTxGas: 2, //TODO find out why created from sdk transaction transforms this value to 0
        operation: 1,
        nonce: nonce,
      };

      const sdkTx = await safeSdk.createTransaction({
        safeTransactionData,
      });

      const wrapperTxResult = await App.SafeWrapper_Module.createTransaction(
        {
          tx: {
            ...safeTransactionData,
            safeTxGas: String(safeTransactionData.safeTxGas),
            baseGas: String(safeTransactionData.baseGas),
            gasPrice: String(safeTransactionData.gasPrice),
            nonce: String(nonce),
            operation: String(safeTransactionData.operation),
          },
        },
        client,
        wrapperUri
      );

      !wrapperTxResult.ok && console.log("wrapperTx", wrapperTxResult);

      //@ts-ignore
      const wrapperTxData = wrapperTxResult.value.data as SafeTransactionData;
      const sdkTxData = sdkTx.data;

      expect(wrapperTxData.to).toEqual(sdkTxData.to);
      expect(wrapperTxData.value).toEqual(sdkTxData.value);
      expect(wrapperTxData.data).toEqual(sdkTxData.data);
      expect(wrapperTxData.baseGas).toEqual(sdkTxData.baseGas.toString());
      expect(wrapperTxData.gasPrice).toEqual(sdkTxData.gasPrice.toString());
      expect(wrapperTxData.gasToken).toEqual(sdkTxData.gasToken);
      expect(wrapperTxData.refundReceiver).toEqual(sdkTxData.refundReceiver);
      expect(wrapperTxData.nonce).toEqual(sdkTxData.nonce.toString());
      expect(wrapperTxData.safeTxGas).toEqual(sdkTxData.safeTxGas.toString());
    });

    it("Should create SDK-like transaction based on minimal transaction data ", async () => {
      const { accounts, contractNetworks } = await setupTests();
      const [account1] = accounts;
      const ethAdapter = await getEthAdapter(account1.signer);

      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress: safeAddress,
        //@ts-ignore
        contractNetworks,
      });

      /*       const nonce = (await ethAdapter.getNonce(account1.address)) + 1;
       */
      const safeTransactionData = {
        to: account1.address,
        value: "500000000000000000", // 0.5 ETH
        data: "0x",
      };

      const sdkTx = await safeSdk.createTransaction({
        safeTransactionData: { ...safeTransactionData /* nonce: nonce */ },
      });

      const wrapperTxResult = await App.SafeWrapper_Module.createTransaction(
        {
          tx: safeTransactionData,
        },
        client,
        wrapperUri
      );

      !wrapperTxResult.ok && console.log("wrapperTx", wrapperTxResult);

      //@ts-ignore
      const wrapperTxData = wrapperTxResult.value.data;
      const sdkTxData = sdkTx.data;

      expect(wrapperTxData.to).toEqual(sdkTxData.to);
      expect(wrapperTxData.value).toEqual(sdkTxData.value);
      expect(wrapperTxData.data).toEqual(sdkTxData.data);
      expect(wrapperTxData.baseGas).toEqual(sdkTxData.baseGas.toString());
      expect(wrapperTxData.gasPrice).toEqual(sdkTxData.gasPrice.toString());
      expect(wrapperTxData.gasToken).toEqual(sdkTxData.gasToken);
      expect(wrapperTxData.refundReceiver).toEqual(sdkTxData.refundReceiver);
      expect(wrapperTxData.nonce).toEqual(sdkTxData.nonce.toString());
      expect(wrapperTxData.safeTxGas).toEqual(sdkTxData.safeTxGas.toString());
    });

    it("Should return transaction hash SDK-like", async () => {
      const { accounts, contractNetworks } = await setupTests();
      const [account1] = accounts;
      const ethAdapter = await getEthAdapter(account1.signer);

      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress: safeAddress,
        //@ts-ignore
        contractNetworks,
      });

      const nonce = await ethAdapter.getNonce(account1.address);

      const tx = await safeSdk.createTransaction({
        safeTransactionData: {
          data: "0x",
          value: "50000",
          to: account1.address,
          nonce: nonce + 1,
        },
      });

      const { baseGas, gasPrice, nonce: txNonce, safeTxGas } = tx.data;

      const sdkHash = await safeSdk.getTransactionHash(tx);

      const wrapperHashResult = await App.SafeWrapper_Module.getTransactionHash(
        {
          tx: {
            ...tx.data,
            safeTxGas: String(safeTxGas),
            baseGas: String(baseGas),
            gasPrice: String(gasPrice),
            nonce: String(txNonce),
            operation: String(tx.data.operation),
          },
        },
        client,
        wrapperUri
      );

      !wrapperHashResult.ok && console.log(wrapperHashResult);

      //@ts-ignore
      const wrapperHash = wrapperHashResult.value as string;

      //console.log("sdkHash:", sdkHash);
      //console.log("wrapperHash", wrapperHash);

      expect(wrapperHash).toEqual(sdkHash);
    });

    it("Should sign transaction hash SDK-like", async () => {
      const { accounts, contractNetworks } = await setupTests();
      const [account1] = accounts;

      const ethAdapter = await getEthAdapter(account1.signer);

      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress: safeAddress,
        //@ts-ignore
        contractNetworks,
      });

      const nonce = await ethAdapter.getNonce(account1.address);

      const tx = await safeSdk.createTransaction({
        safeTransactionData: {
          data: "0x",
          value: "50000",
          to: account1.address,
          nonce: nonce + 1,
        },
      });

      const txHash = await safeSdk.getTransactionHash(tx);
      //console.log("txHash: ", txHash);

      const wrapperSignedResult =
        await App.SafeWrapper_Module.signTransactionHash(
          { hash: txHash },
          client,
          wrapperUri
        );

      !wrapperSignedResult.ok && console.log();

      //@ts-ignore
      const wrapperSigned = wrapperSignedResult.value;
      //console.log("wrapperAdjustedSignature", wrapperSigned);

      const sdkSigned = await safeSdk.signTransactionHash(txHash);
      //console.log("sdkSigned", sdkSigned);

      expect(wrapperSigned).toEqual(sdkSigned);
    });

    it("Should create and sign transaction SDK-like", async () => {
      const { accounts, contractNetworks } = await setupTests();
      const [account1] = accounts;
      const ethAdapter = await getEthAdapter(account1.signer);

      const safeSdk = await Safe.create({
        ethAdapter,
        safeAddress: safeAddress,
        //@ts-ignore
        contractNetworks,
      });

      const nonce = (await ethAdapter.getNonce(account1.address)) + 1;

      const safeTransactionData: SafeTransactionDataPartial = {
        to: account1.address,
        value: "500000000000000000", // 0.5 ETH
        data: "0x",
        baseGas: 111,
        gasPrice: 453,
        gasToken: zeroAddress(),
        refundReceiver: zeroAddress(),
        safeTxGas: 0, //TODO find out why created from sdk transaction transforms this value to 0
        operation: 0,
      };

      const sdkTx = await safeSdk.createTransaction({
        safeTransactionData: { ...safeTransactionData, nonce: nonce },
      });
      const wrapperTxResult = await App.SafeWrapper_Module.createTransaction(
        {
          tx: {
            ...safeTransactionData,
            safeTxGas: String(safeTransactionData.safeTxGas),
            baseGas: String(safeTransactionData.baseGas),
            gasPrice: String(safeTransactionData.gasPrice),
            nonce: String(nonce),
            operation: String(safeTransactionData.operation),
          },
        },
        client,
        wrapperUri
      );

      //@ts-ignore
      const wrapperTx = wrapperTxResult.value;

      const sdkSigned = await safeSdk.signTransaction(sdkTx);

      const wrapperSignedResult = await App.SafeWrapper_Module.addSignature(
        { tx: wrapperTx },
        client,
        wrapperUri
      );

      //@ts-ignore
      const wrapperSigned = wrapperSignedResult.value as SafeTransaction;

      // console.log("sdkSigned", sdkSigned);
      // console.log("wrapperSigned", wrapperSigned);

      //expect(wrapperSigned.data).toEqual(sdkSigned.data);

      expect(wrapperSigned.signatures!.values()).toEqual(
        sdkSigned.signatures.values()
      );

      const wrapperTxData = wrapperSigned.data;
      const sdkTxData = sdkSigned.data;

      expect(wrapperTxData.to).toEqual(sdkTxData.to);
      expect(wrapperTxData.value).toEqual(sdkTxData.value);
      expect(wrapperTxData.data).toEqual(sdkTxData.data);
      expect(wrapperTxData.baseGas).toEqual(sdkTxData.baseGas.toString());
      expect(wrapperTxData.gasPrice).toEqual(sdkTxData.gasPrice.toString());
      expect(wrapperTxData.gasToken).toEqual(sdkTxData.gasToken);
      expect(wrapperTxData.refundReceiver).toEqual(sdkTxData.refundReceiver);
      expect(wrapperTxData.nonce).toEqual(sdkTxData.nonce.toString());
      expect(wrapperTxData.safeTxGas).toEqual(sdkTxData.safeTxGas.toString());
    });
  });
});
