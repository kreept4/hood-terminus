// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * A launched token.
 *
 * Deliberately the most boring ERC-20 that can exist. No owner, no mint after
 * construction, no pause, no blocklist, no transfer hook, no fee-on-transfer.
 *
 * Every one of those is a lever a rug pull is executed with, and a launchpad
 * whose tokens carry them is a launchpad whose tokens cannot be trusted
 * sight-unseen. Because this contract is fixed and every token is deployed from
 * the same bytecode, a buyer can verify the code once and then trust every
 * token this factory has ever produced by comparing a code hash. That property
 * is worth more than any feature that could be added here.
 *
 * Total supply is minted once, to the launchpad, at construction.
 */
contract HoodToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error InsufficientBalance();
    error InsufficientAllowance();
    error ZeroAddress();

    constructor(string memory _name, string memory _symbol, uint256 _supply, address _to) {
        name = _name;
        symbol = _symbol;
        totalSupply = _supply;
        balanceOf[_to] = _supply;
        emit Transfer(address(0), _to, _supply);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        // The max-allowance shortcut every router relies on: an infinite
        // approval is not decremented, which saves a storage write per swap.
        if (allowed != type(uint256).max) {
            if (allowed < value) revert InsufficientAllowance();
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) private {
        if (to == address(0)) revert ZeroAddress();
        uint256 balance = balanceOf[from];
        if (balance < value) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = balance - value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }
}
