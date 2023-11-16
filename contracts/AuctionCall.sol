// SPDX-License-Identifier: UNLICENCED
pragma solidity >=0.8.0 <0.9.0;
// nihao
import "./owner.sol";
import "./AuctionInstance.sol";
import "fhevm/lib/TFHE.sol";

contract AuctionCall is Ownable {
    event NewOrderAlert(address creator, address auction_address, AuctionInstance.OrderDetail orderdetail);

    mapping(address => uint) Auction_Count; // 同一个卖方当前有多少个拍卖订单在进行
    mapping(address => bool) Auction_inProgress; // 某个拍卖订单（合约地址）是否正在进行

    uint public auction_limit;

    constructor(uint _auction_limit) {
        auction_limit = _auction_limit; // TODO: require>=1
    }

    function SetAuctionLimit(uint _auction_limit) public onlyOwner {
        auction_limit = _auction_limit; // TODO: require>=1
    }

    function RetractAuction(address auction_address) public OutsourseImmutability(msg.sender, tx.origin) {
        require(Auction_inProgress[auction_address], "No auction with this address is in progress.");
        (bool hasbeen_retracted, bytes memory permission) = auction_address.call(
            abi.encodeWithSignature("isOwner_general(address)", msg.sender)
        );
        require(hasbeen_retracted, "The call of retract has failed.");
        require(abi.decode(permission, (bool)), "You are not the creator of this auction contract.");
        Auction_Count[msg.sender]--;
        delete Auction_inProgress[auction_address];
        (bool notin_progress, ) = auction_address.call(abi.encodeWithSignature("RetractMyAuction()"));
        require(notin_progress, "The call of retract has failed.");
    }

    modifier AuctionLimit(uint count) {
        require(
            count < auction_limit,
            "You have reached the maximum number of auction initiations and cannot start a new auction. We recommend that you either remove previous auctions or conclude them as soon as possible."
        );
        _;
    }

    modifier OutsourseImmutability(address baseaddress, address outsourseaddress) {
        // preserve for the future
        require(baseaddress == outsourseaddress);
        _;
    }

    function CreateNewAuction(
        string memory _orderinfo,
        string memory _coal_category,
        uint _reserve_priceinunit,
        uint _quantity,
        uint _minimalsplit,
        uint _duration
    ) public AuctionLimit(Auction_Count[msg.sender]) OutsourseImmutability(msg.sender, tx.origin) {
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
        AuctionInstance new_auction = new AuctionInstance(orderdetail);
        address newinstance_Address = address(new_auction);
        Auction_Count[msg.sender]++;
        Auction_inProgress[newinstance_Address] = true;
        emit NewOrderAlert(msg.sender, newinstance_Address, orderdetail);
    }
}
