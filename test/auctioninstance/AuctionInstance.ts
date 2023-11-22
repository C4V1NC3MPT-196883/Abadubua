import { expect } from "chai";
import { getDefaultProvider } from "ethers";
import type { FhevmInstance } from "fhevmjs";
import { ethers } from "hardhat";

import { createInstances } from "../instance";
import { getSigners } from "../signers";
import { createTransaction } from "../utils";
import { getnewcontractfromdeploy, uint8ArrayToBytes32 } from "./AuctionInstance.fixture";

//import { uint8ArrayToBytes32 } from "./AuctionInstance.fixture";

describe("AuctionInstance", function () {
  before(async function () {
    this.signers = await getSigners(ethers);
    [this.contractAddress, this.callcontractAddress, this.callbobAddress] = await getnewcontractfromdeploy();
    this.InstanceContract = await ethers.getContractAt("AuctionInstance", this.contractAddress);
    this.instances = await createInstances(this.contractAddress, ethers, this.signers);
  });

  it("correct initialization?", async function () {
    expect(await this.InstanceContract.owner()).to.equal(this.signers.bob.address);
    expect(await this.InstanceContract.address_auctioncall()).to.equal(this.callcontractAddress);
    //console.log(await this.InstanceContract.currentstate());
    expect(await this.InstanceContract.currentstate()).to.equal(0);
  });
});
