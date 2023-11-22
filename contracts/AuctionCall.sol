// SPDX-License-Identifier: UNLICENCED
pragma solidity >=0.8.0 <0.9.0;

import "./AuctionInstance.sol";
import "fhevm/lib/TFHE.sol";

contract AuctionCall {
    event NewOrderAlert(address creator, address auction_address, AuctionInstance.OrderDetail orderdetail);
    event AuctionLimitChange(string changelog);

    address private owner;
    mapping(address => uint) public Auction_Count; // 同一个卖方当前有多少个拍卖订单在进行
    mapping(address => address) public Auction_Owner; // 指示拍卖合约地址对应的卖方地址
    uint public auction_limit;

    //AuctionInstance public temporary_contract;

    constructor(uint _auction_limit) {
        require(
            _auction_limit >= 1,
            "The limit of auctions simultaneously launched by any seller should be at least 1."
        );
        require(msg.sender == tx.origin, "You are not an external account in Ethereum.");
        owner = msg.sender;
        auction_limit = _auction_limit;
    }

    function SetAuctionLimit(uint _auction_limit) public onlyOwner {
        auction_limit = _auction_limit;
        emit AuctionLimitChange(
            string.concat(
                "The limit of auctions simultaneously launched by any seller has been adjusted to",
                string(abi.encodePacked(auction_limit))
            )
        );
    }

    function RetractAuction() public {
        require(Auction_Owner[msg.sender] == tx.origin, "Invalid retraction.");
        delete Auction_Owner[msg.sender];
        Auction_Count[tx.origin]--;
    }

    function TerminateAuction() public {
        require(Auction_Owner[msg.sender] == tx.origin, "Invalid termination.");
        delete Auction_Owner[msg.sender];
        Auction_Count[tx.origin]--;
    }

    function CreateNewAuction(
        bytes32 _publickey,
        string memory _orderinfo,
        string memory _coal_category,
        uint _reserve_priceinunit,
        uint _quantity,
        uint _minimalsplit,
        uint _duration
    ) public AuctionLimit(Auction_Count[msg.sender]) OutsourseImmutability {
        require(_minimalsplit <= _quantity, "Any split of quantity shouldn't be larger than the quantity in total.");
        AuctionInstance.OrderDetail memory orderdetail = AuctionInstance.OrderDetail(
            _orderinfo,
            _coal_category,
            _reserve_priceinunit,
            _quantity,
            _minimalsplit,
            block.timestamp,
            block.timestamp + _duration
        );
        AuctionInstance new_auction = new AuctionInstance(orderdetail, _publickey);
        //temporary_contract = new_auction;
        address newinstance_Address = address(new_auction);
        Auction_Count[msg.sender]++;
        Auction_Owner[newinstance_Address] = msg.sender;
        emit NewOrderAlert(msg.sender, newinstance_Address, orderdetail);
    }

    modifier AuctionLimit(uint count) {
        require(
            count < auction_limit,
            "You have reached the maximum number of auction initiations and cannot start a new auction. We recommend that you either remove previous auctions or conclude them as soon as possible."
        );
        _;
    }

    modifier OutsourseImmutability() {
        // preserve for the future
        require(msg.sender == tx.origin, "You are not an external account in Ethereum.");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "You are not the owner of this contract.");
        _;
    }
}
