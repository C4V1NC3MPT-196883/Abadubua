import { expect } from "chai";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

import { createInstances } from "../instance";
import { getSigners } from "../signers";
import { createTransaction } from "../utils";
import { deployAuctionCallFixture } from "./AuctionCall.fixture";

describe("AuctionCall", function () {
  before(async function () {
    this.signers = await getSigners(ethers);
  });

  beforeEach(async function () {
    const contract = await deployAuctionCallFixture();
    this.contractAddress = await contract.getAddress();
    this.auction = contract;
    this.instances = await createInstances(this.contractAddress, ethers, this.signers);
  });

  it("should set the correct auction_limit", async function () {
    expect(await this.auction.auction_limit()).to.equal(2);
  });

  it("should change the auction_limit to 4", async function () {
    const tx = await this.auction.connect(this.signers.alice).SetAuctionLimit(4);
    await tx.wait();
    expect(await this.auction.auction_limit()).to.equal(4);
  });

  it("test create new auction", async function () {
    const tx_bob = await this.auction
      .connect(this.signers.bob)
      .CreateNewAuction(
        [
          10, 251, 252, 160, 190, 33, 108, 31, 106, 188, 179, 254, 98, 161, 196, 27, 212, 37, 155, 184, 217, 111, 31,
          39, 93, 123, 197, 249, 233, 158, 231, 101,
        ],
        "test1",
        "coking coal",
        10,
        100,
        5,
        10,
      );
    await tx_bob.wait();
    expect(await this.auction.Auction_Count(this.signers.bob.address)).to.equal(1);
  });
});
