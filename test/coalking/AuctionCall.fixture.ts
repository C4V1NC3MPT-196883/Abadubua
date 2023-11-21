import { ethers } from "hardhat";

import type { AuctionCall } from "../../types";
import { getSigners } from "../signers";

export async function deployAuctionCallFixture(): Promise<AuctionCall> {
  const signers = await getSigners(ethers);

  const contractFactory = await ethers.getContractFactory("AuctionCall");
  const contract = await contractFactory.connect(signers.alice).deploy(2); /**默认构造中的auction_limit=2  */
  await contract.waitForDeployment();

  return contract;
}
