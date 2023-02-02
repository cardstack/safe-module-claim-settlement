import "@nomiclabs/hardhat-ethers";

import { expect } from "chai";
import { keccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

import { setupAvatar, setupConfig, setupTokens } from "./fixtures";
import MerkleTree from "./merkle_tree";

describe("MerkleAccessModule", async () => {
  const abiCoder = new ethers.utils.AbiCoder();
  async function setupFixture() {
    const [deployer, validator, payee] = await ethers.getSigners();
    const { token, gasToken } = await setupTokens();
    const { avatar, tx } = await setupAvatar();
    const config = await setupConfig();
    const MerkleAccessModule = await ethers.getContractFactory(
      "MerkleAccessModule",
      { signer: deployer }
    );
    const merkleAccessModule = await MerkleAccessModule.deploy(
      validator.address,
      avatar.address,
      avatar.address,
      config
    );
    await avatar.enableModule(merkleAccessModule.address);
    return {
      wallets: {
        payee,
        validator,
      },
      token,
      gasToken,
      avatar,
      tx,
      modules: {
        merkleAccessModule,
      },
    };
  }
  describe("merkleTransaction()", async () => {
    it("should support tranferring a token when there's more than one potential claim", async () => {
      const {
        avatar,
        tx,
        token,
        gasToken,
        modules: { merkleAccessModule },
        wallets: { payee, validator },
      } = await loadFixture(setupFixture);
      // Setup funds
      const mintAmount = "10000000000000000000"; //10 eth
      const transferAmount = "1000000000000000000"; //1 eth
      await token.mint(avatar.address, mintAmount);
      await gasToken.mint(avatar.address, mintAmount);
      const rootId =
        "0x0000000000000000000000000000000000000000000000000000000000000001";
      const currentTime = await time.latest();
      const leaves = [];
      for (let i = 0; i < 1024; i++) {
        leaves.push(
          abiCoder.encode(
            ["address", "bytes4", "uint256", "bytes", "bytes", "bytes"],
            [
              merkleAccessModule.address,
              [1, 1, 0, 4],
              1,
              abiCoder.encode(
                ["address", "uint256", "uint256"],
                [avatar.address, currentTime, currentTime + 100 + i]
              ),
              abiCoder.encode([], []),
              abiCoder.encode(
                ["address", "uint256", "address"],
                [token.address, transferAmount, payee.address]
              ),
            ]
          )
        );
      }
      const tree = new MerkleTree(leaves);
      // const proof: string[] = [];
      const root = tree.getHexRoot();
      const setRoot = await merkleAccessModule
        .connect(validator.address)
        .populateTransaction.setRoot(rootId, root);
      await expect(
        avatar.execTransaction(
          merkleAccessModule.address,
          tx.value,
          setRoot.data,
          tx.operation,
          tx.avatarTxGas,
          tx.baseGas,
          tx.gasPrice,
          tx.gasToken,
          tx.refundReceiver,
          tx.signatures
        )
      );
      expect(await token.balanceOf(payee.address)).to.equal(0);
      await merkleAccessModule.merkleExecute(
        leaves[0],
        tree.getProof(leaves[0]),
        abiCoder.encode([], [])
      );

      expect(await token.balanceOf(payee.address)).to.equal(transferAmount);
      expect(await token.balanceOf(avatar.address)).to.equal(
        "9000000000000000000"
      );
    });

    it("should support tranferring a token", async () => {
      const {
        avatar,
        tx,
        token,
        gasToken,
        modules: { merkleAccessModule },
        wallets: { payee, validator },
      } = await loadFixture(setupFixture);
      // Setup funds
      const mintAmount = "10000000000000000000"; //10 eth
      const transferAmount = "1000000000000000000"; //1 eth
      await token.mint(avatar.address, mintAmount);
      await gasToken.mint(avatar.address, mintAmount);
      const rootId =
        "0x0000000000000000000000000000000000000000000000000000000000000001";
      const currentTime = await time.latest();
      const leaf = abiCoder.encode(
        ["address", "bytes4", "uint256", "bytes", "bytes", "bytes"],
        [
          merkleAccessModule.address,
          [1, 1, 0, 4],
          1,
          abiCoder.encode(
            ["address", "uint256", "uint256"],
            [avatar.address, currentTime, currentTime + 100]
          ),
          abiCoder.encode([], []),
          abiCoder.encode(
            ["address", "uint256", "address"],
            [token.address, transferAmount, payee.address]
          ),
        ]
      );
      // With one leaf the proof is empty and the root is the leaf hashed
      const proof: string[] = [];
      const root = keccak256(leaf);
      const setRoot = await merkleAccessModule
        .connect(validator.address)
        .populateTransaction.setRoot(rootId, root);
      await expect(
        avatar.execTransaction(
          merkleAccessModule.address,
          tx.value,
          setRoot.data,
          tx.operation,
          tx.avatarTxGas,
          tx.baseGas,
          tx.gasPrice,
          tx.gasToken,
          tx.refundReceiver,
          tx.signatures
        )
      );
      expect(await token.balanceOf(payee.address)).to.equal(0);
      await merkleAccessModule.merkleExecute(
        leaf,
        proof,
        abiCoder.encode([], [])
      );

      expect(await token.balanceOf(payee.address)).to.equal(transferAmount);
      expect(await token.balanceOf(avatar.address)).to.equal(
        "9000000000000000000"
      );
    });
  });
});
