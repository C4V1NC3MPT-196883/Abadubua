// SPDX-License-Identifier: UNLICENCED
pragma solidity >=0.8.0 <0.9.0;
//合约、结构体、枚举、事件：Pascal
//函数、中间变量、参数：Camel
//常数：screaming
//private：_
import "./AuctionOrder.sol";
import "fhevm/lib/TFHE.sol";

// TODO:限制分划数量
contract OrderMarket {
    address private _owner;
    mapping(address => uint) public _orderCount; // 同一个卖方当前有多少个拍卖订单在进行
    mapping(address => address) public _orderOwner; // 指示拍卖合约地址对应的卖方地址
    uint public maxOrderCount;

    event NewOrder(address creator, address orderContractAddress, AuctionOrder.OrderDetail orderDetail);

    modifier isQualified(uint count) {
        require(
            count < maxOrderCount,
            "You have reached the maximum number of auction initiations and cannot start a new auction. We recommend that you either remove previous auctions or conclude them as soon as possible."
        );
        _;
    }

    modifier onlyEOA() {
        // preserve for the future
        require(msg.sender == tx.origin, "You are not an externally owned account in Ethereum.");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == _owner, "You are not the owner of this contract.");
        _;
    }

    constructor(uint _maxOrderCount) {
        require(
            _maxOrderCount >= 1,
            "The limit of auctions simultaneously launched by any seller should be at least 1."
        );
        require(msg.sender == tx.origin, "You are not an externally owned account in Ethereum.");
        _owner = msg.sender;
        maxOrderCount = _maxOrderCount;
    }

    function setMaxOrderCount(uint _maxOrderCount) public onlyOwner {
        require(
            _maxOrderCount >= 1,
            "The maximal count of orders simultaneously launched by any seller should be at least 1."
        );
        maxOrderCount = _maxOrderCount;
    }

    function finalizeOrder(string calldata reason) public {
        require(_orderOwner[msg.sender] == tx.origin, reason);
        delete _orderOwner[msg.sender];
        _orderCount[tx.origin]--;
    }

    function createNewOrder(
        bytes32 _publickey,
        string memory _orderinfo,
        string memory _coalCategory,
        uint _reservePrice,
        uint _quantity,
        uint _minimalClaimQuantity,
        uint _duration
    ) public isQualified(_orderCount[msg.sender]) onlyEOA {
        require(
            _minimalClaimQuantity <= _quantity,
            "Any claimed quantity shouldn't be greater than the quantity in total."
        );
        AuctionOrder.OrderDetail memory orderDetail = AuctionOrder.OrderDetail(
            _orderinfo,
            _coalCategory,
            _reservePrice,
            _quantity,
            _minimalClaimQuantity,
            block.timestamp,
            block.timestamp + _duration
        );
        AuctionOrder orderContract = new AuctionOrder(orderDetail, _publickey, _owner);
        address orderContractAddress = address(orderContract);
        _orderCount[msg.sender]++;
        _orderOwner[orderContractAddress] = msg.sender;
        emit NewOrder(msg.sender, orderContractAddress, orderDetail);
    }
}
