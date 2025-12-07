// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ERC8004ReputationRegistry
 * @dev Reputation Registry for AI Agents (ERC8004)
 * Allows clients to submit feedback and ratings for agents
 */
contract ERC8004ReputationRegistry is Ownable {
    
    // Feedback structure
    struct Feedback {
        address client; // Who submitted the feedback
        uint256 agentTokenId; // Agent's identity token ID
        uint8 rating; // 1-5 rating
        string[] tags; // Optional tags (e.g., "fast", "accurate", "helpful")
        string comment; // Optional text comment
        bytes32 paymentProof; // Hash of payment transaction (links feedback to payment)
        uint256 timestamp;
        bool verified; // Whether feedback is verified (linked to payment)
    }
    
    // Mapping from feedback ID to Feedback
    mapping(uint256 => Feedback) public feedbacks;
    
    // Mapping from agent token ID to array of feedback IDs
    mapping(uint256 => uint256[]) public agentFeedbacks;
    
    // Mapping from client address to array of feedback IDs they submitted
    mapping(address => uint256[]) public clientFeedbacks;
    
    // Agent reputation summary
    struct ReputationSummary {
        uint256 totalFeedbacks;
        uint256 verifiedFeedbacks;
        uint256 averageRating; // Scaled by 100 (e.g., 350 = 3.5)
        uint256 totalRatingSum;
        mapping(string => uint256) tagCounts; // Count of each tag
    }
    
    mapping(uint256 => ReputationSummary) public agentReputations;
    
    uint256 private _feedbackCounter;
    
    // Reference to Identity Registry (to verify agent exists)
    address public identityRegistry;
    
    event FeedbackSubmitted(
        uint256 indexed feedbackId,
        uint256 indexed agentTokenId,
        address indexed client,
        uint8 rating,
        bytes32 paymentProof
    );
    
    event FeedbackVerified(uint256 indexed feedbackId, bool verified);
    
    constructor(address _identityRegistry) Ownable(msg.sender) {
        identityRegistry = _identityRegistry;
    }
    
    /**
     * @dev Set the Identity Registry address
     * @param _identityRegistry Address of the Identity Registry contract
     */
    function setIdentityRegistry(address _identityRegistry) public onlyOwner {
        identityRegistry = _identityRegistry;
    }
    
    /**
     * @dev Submit feedback for an agent
     * @param agentTokenId The agent's identity token ID
     * @param rating Rating from 1-5
     * @param tags Array of tag strings
     * @param comment Optional text comment
     * @param paymentProof Hash of the payment transaction (optional, can be 0x0)
     * @return feedbackId The ID of the submitted feedback
     */
    function submitFeedback(
        uint256 agentTokenId,
        uint8 rating,
        string[] memory tags,
        string memory comment,
        bytes32 paymentProof
    ) public returns (uint256) {
        require(rating >= 1 && rating <= 5, "Rating must be between 1 and 5");
        require(identityRegistry != address(0), "Identity registry not set");
        
        // Verify agent exists (would need interface, simplified here)
        // In production, import IERC721 and check ownerOf(agentTokenId) != address(0)
        
        _feedbackCounter++;
        uint256 feedbackId = _feedbackCounter;
        
        bool verified = (paymentProof != bytes32(0));
        
        feedbacks[feedbackId] = Feedback({
            client: msg.sender,
            agentTokenId: agentTokenId,
            rating: rating,
            tags: tags,
            comment: comment,
            paymentProof: paymentProof,
            timestamp: block.timestamp,
            verified: verified
        });
        
        // Add to agent's feedback list
        agentFeedbacks[agentTokenId].push(feedbackId);
        
        // Add to client's feedback list
        clientFeedbacks[msg.sender].push(feedbackId);
        
        // Update reputation summary
        ReputationSummary storage reputation = agentReputations[agentTokenId];
        reputation.totalFeedbacks++;
        if (verified) {
            reputation.verifiedFeedbacks++;
        }
        reputation.totalRatingSum += rating;
        reputation.averageRating = (reputation.totalRatingSum * 100) / reputation.totalFeedbacks;
        
        // Update tag counts
        for (uint256 i = 0; i < tags.length; i++) {
            reputation.tagCounts[tags[i]]++;
        }
        
        emit FeedbackSubmitted(feedbackId, agentTokenId, msg.sender, rating, paymentProof);
        
        return feedbackId;
    }
    
    /**
     * @dev Verify a feedback by linking it to a payment transaction
     * @param feedbackId The feedback ID to verify
     * @param paymentProof Hash of the payment transaction
     */
    function verifyFeedback(uint256 feedbackId, bytes32 paymentProof) public onlyOwner {
        require(feedbacks[feedbackId].client != address(0), "Feedback does not exist");
        require(!feedbacks[feedbackId].verified, "Feedback already verified");
        require(paymentProof != bytes32(0), "Invalid payment proof");
        
        feedbacks[feedbackId].paymentProof = paymentProof;
        feedbacks[feedbackId].verified = true;
        
        uint256 agentTokenId = feedbacks[feedbackId].agentTokenId;
        agentReputations[agentTokenId].verifiedFeedbacks++;
        
        emit FeedbackVerified(feedbackId, true);
    }
    
    /**
     * @dev Get feedback by ID
     * @param feedbackId The feedback ID
     * @return Feedback struct
     */
    function getFeedback(uint256 feedbackId) public view returns (Feedback memory) {
        return feedbacks[feedbackId];
    }
    
    /**
     * @dev Get all feedback IDs for an agent
     * @param agentTokenId The agent's token ID
     * @return Array of feedback IDs
     */
    function getAgentFeedbacks(uint256 agentTokenId) public view returns (uint256[] memory) {
        return agentFeedbacks[agentTokenId];
    }
    
    /**
     * @dev Get reputation summary for an agent
     * @param agentTokenId The agent's token ID
     * @return totalFeedbacks Total number of feedbacks
     * @return verifiedFeedbacks Number of verified feedbacks
     * @return averageRating Average rating (scaled by 100)
     */
    function getReputationSummary(uint256 agentTokenId)
        public
        view
        returns (
            uint256 totalFeedbacks,
            uint256 verifiedFeedbacks,
            uint256 averageRating
        )
    {
        ReputationSummary storage reputation = agentReputations[agentTokenId];
        return (
            reputation.totalFeedbacks,
            reputation.verifiedFeedbacks,
            reputation.averageRating
        );
    }
    
    /**
     * @dev Get tag count for an agent
     * @param agentTokenId The agent's token ID
     * @param tag The tag to check
     * @return count Number of times this tag was used
     */
    function getTagCount(uint256 agentTokenId, string memory tag)
        public
        view
        returns (uint256)
    {
        return agentReputations[agentTokenId].tagCounts[tag];
    }
}

