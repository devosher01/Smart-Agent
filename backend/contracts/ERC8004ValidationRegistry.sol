// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ERC8004ValidationRegistry
 * @dev Validation Registry for AI Agents (ERC8004)
 * Stores cryptographic proofs of task completion and validation
 */
contract ERC8004ValidationRegistry is Ownable {
    
    // Validation proof structure
    struct ValidationProof {
        uint256 agentTokenId; // Agent's identity token ID
        string taskId; // Unique task identifier
        bytes32 outputHash; // Hash of the agent's output
        bytes32 proofHash; // Hash of the validation proof (ZK proof, re-execution result, etc.)
        address validator; // Address of the validator (if any)
        ValidationType validationType; // Type of validation
        bool isValid; // Whether the validation passed
        uint256 timestamp;
        string metadataURI; // URI to additional metadata (IPFS, etc.)
    }
    
    enum ValidationType {
        NONE, // No validation
        RE_EXECUTION, // Stake-secured re-execution
        ZERO_KNOWLEDGE, // ZK proof
        CONSENSUS, // Multiple validators consensus
        ORACLE // Oracle-based validation
    }
    
    // Mapping from validation ID to ValidationProof
    mapping(uint256 => ValidationProof) public validations;
    
    // Mapping from agent token ID to array of validation IDs
    mapping(uint256 => uint256[]) public agentValidations;
    
    // Mapping from task ID to validation ID
    mapping(string => uint256) public taskToValidation;
    
    // Mapping from output hash to validation ID (for deduplication)
    mapping(bytes32 => uint256) public outputHashToValidation;
    
    uint256 private _validationCounter;
    
    // Reference to Identity Registry
    address public identityRegistry;
    
    event ValidationRecorded(
        uint256 indexed validationId,
        uint256 indexed agentTokenId,
        string taskId,
        bytes32 outputHash,
        ValidationType validationType,
        bool isValid
    );
    
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
     * @dev Record a validation proof for an agent's task completion
     * @param agentTokenId The agent's identity token ID
     * @param taskId Unique task identifier
     * @param outputHash Hash of the agent's output
     * @param proofHash Hash of the validation proof
     * @param validator Address of the validator (can be address(0) for self-validation)
     * @param validationType Type of validation used
     * @param isValid Whether the validation passed
     * @param metadataURI URI to additional metadata
     * @return validationId The ID of the recorded validation
     */
    function recordValidation(
        uint256 agentTokenId,
        string memory taskId,
        bytes32 outputHash,
        bytes32 proofHash,
        address validator,
        ValidationType validationType,
        bool isValid,
        string memory metadataURI
    ) public returns (uint256) {
        require(identityRegistry != address(0), "Identity registry not set");
        
        // Check if validation for this task already exists
        require(taskToValidation[taskId] == 0, "Validation for this task already exists");
        
        _validationCounter++;
        uint256 validationId = _validationCounter;
        
        validations[validationId] = ValidationProof({
            agentTokenId: agentTokenId,
            taskId: taskId,
            outputHash: outputHash,
            proofHash: proofHash,
            validator: validator,
            validationType: validationType,
            isValid: isValid,
            timestamp: block.timestamp,
            metadataURI: metadataURI
        });
        
        // Update mappings
        agentValidations[agentTokenId].push(validationId);
        taskToValidation[taskId] = validationId;
        outputHashToValidation[outputHash] = validationId;
        
        emit ValidationRecorded(
            validationId,
            agentTokenId,
            taskId,
            outputHash,
            validationType,
            isValid
        );
        
        return validationId;
    }
    
    /**
     * @dev Get validation proof by ID
     * @param validationId The validation ID
     * @return ValidationProof struct
     */
    function getValidation(uint256 validationId) public view returns (ValidationProof memory) {
        return validations[validationId];
    }
    
    /**
     * @dev Get validation ID for a task
     * @param taskId The task ID
     * @return validationId The validation ID (0 if not found)
     */
    function getValidationByTask(string memory taskId) public view returns (uint256) {
        return taskToValidation[taskId];
    }
    
    /**
     * @dev Get validation ID by output hash
     * @param outputHash The output hash
     * @return validationId The validation ID (0 if not found)
     */
    function getValidationByOutput(bytes32 outputHash) public view returns (uint256) {
        return outputHashToValidation[outputHash];
    }
    
    /**
     * @dev Get all validation IDs for an agent
     * @param agentTokenId The agent's token ID
     * @return Array of validation IDs
     */
    function getAgentValidations(uint256 agentTokenId) public view returns (uint256[] memory) {
        return agentValidations[agentTokenId];
    }
    
    /**
     * @dev Get validation statistics for an agent
     * @param agentTokenId The agent's token ID
     * @return totalValidations Total number of validations
     * @return validCount Number of valid validations
     * @return invalidCount Number of invalid validations
     */
    function getValidationStats(uint256 agentTokenId)
        public
        view
        returns (
            uint256 totalValidations,
            uint256 validCount,
            uint256 invalidCount
        )
    {
        uint256[] memory validationIds = agentValidations[agentTokenId];
        totalValidations = validationIds.length;
        
        for (uint256 i = 0; i < validationIds.length; i++) {
            if (validations[validationIds[i]].isValid) {
                validCount++;
            } else {
                invalidCount++;
            }
        }
    }
}

