// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title VerifikPayment
 * @dev Simple contract to accept payments for Verifik services (x402 style)
 */
contract VerifikPayment {
    address public owner;

    event PaymentReceived(address indexed payer, string serviceId, string requestId, uint256 amount);
    event Withdrawal(address indexed owner, uint256 amount);

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Pay for a specific service request
     * @param serviceId The ID of the service being paid for (e.g., "cedula-validation")
     * @param requestId The unique request ID from the client/server
     */
    function payForService(string memory serviceId, string memory requestId) public payable {
        require(msg.value > 0, "Payment amount must be greater than 0");
        emit PaymentReceived(msg.sender, serviceId, requestId, msg.value);
    }

    /**
     * @dev Withdraw all funds to the owner's address
     */
    function withdraw() public {
        require(msg.sender == owner, "Only owner can withdraw");
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");

        (bool sent, ) = owner.call{value: balance}("");
        require(sent, "Failed to send Ether");

        emit Withdrawal(owner, balance);
    }

    /**
     * @dev Check balance of the contract
     */
    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
}
