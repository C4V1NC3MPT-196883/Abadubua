import { expect } from "chai";
import { error } from "console";
import exp from "constants";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

import { createInstances } from "../instance";
import { getSigners } from "../signers";
import { createTransaction } from "../utils";
import { deployAuctionCallFixture } from "./AuctionCall.fixture";

describe("AuctionInstance", function () {
  before(async function () {
    this.signers = await getSigners(ethers);
  });

  function uint8ArrayToBytes32(uint8Array: Uint8Array): string {
    // 将 Uint8Array 转换为 ethers.js 中的 BytesLike 类型
    const bytesLikeValue = ethers.getBytes(uint8Array);

    // 将 BytesLike 转换为 bytes32
    const bytes32Value = ethers.hexlify(bytesLikeValue);

    return bytes32Value;
  }

  beforeEach(async function () {
    const contract = await deployAuctionCallFixture();
    this.contractAddress = await contract.getAddress();
    this.auction = contract;
    this.instances = await createInstances(this.contractAddress, ethers, this.signers);
  });

  it("check correct instance initialization", async function () {
    const publicKey = this.instances.bob.getTokenSignature(this.contractAddress)!.publicKey;
    const pk_bob = uint8ArrayToBytes32(publicKey);
    const bob_create = await this.auction
      .connect(this.signers.bob)
      .CreateNewAuction(pk_bob, "test1", "coking coal", 10, 100, 5, 10);
    const receipt = await bob_create.wait();
    const address_NewInstance = receipt.logs[0].args[1]; // TODO: can use better method to get address
    const NewInstance = await ethers.getContractAt("AuctionInstance", address_NewInstance);
    expect(await NewInstance.address_auctioncall()).to.equal(this.contractAddress);
    expect(await NewInstance.owner()).to.equal(this.signers.bob.address);
    expect(await NewInstance.BiddersNum()).to.equal(0);
  });
});
