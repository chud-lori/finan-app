const { BaseRequestDTO, BaseResponseDTO } = require('./base.dto');

/**
 * Add Goal Request DTO
 */
class AddGoalRequestDTO extends BaseRequestDTO {
    constructor(data) {
        super(data);
        this.description = data.description;
        this.price = data.price;
    }

    validate() {
        const errors = [];
        if (!this.description || typeof this.description !== 'string') {
            errors.push('Description is required and must be a string');
        }
        if (!this.price || typeof this.price !== 'number' || this.price <= 0) {
            errors.push('Price is required and must be a positive number');
        }
        return errors;
    }
}

/**
 * Goal Response DTO
 */
class GoalResponseDTO {
    constructor(goal) {
        this.id = goal._id;
        this.description = goal.description;
        this.price = goal.price;
        this.createdAt = goal.createdAt;
        this.updatedAt = goal.updatedAt;
    }
}

/**
 * Add Goal Response DTO
 */
class AddGoalResponseDTO {
    constructor(goal) {
        this.goal = new GoalResponseDTO(goal);
    }
}

/**
 * Goal Detail Response DTO
 */
class GoalDetailResponseDTO {
    constructor(goal, balance, savings, need) {
        this.goal = new GoalResponseDTO(goal);
        this.balance = balance ? new BalanceResponseDTO(balance) : null;
        this.achieve = {
            savings: savings,
            need: need
        };
    }
}

/**
 * Balance Response DTO (for goal context)
 */
class BalanceResponseDTO {
    constructor(balance) {
        this.id = balance._id;
        this.amount = balance.amount;
        this.updatedAt = balance.updatedAt;
    }
}

/**
 * Get All Goals Response DTO
 */
class GetAllGoalsResponseDTO {
    constructor(goals) {
        this.goals = goals.map(g => new GoalResponseDTO(g));
    }
}

module.exports = {
    AddGoalRequestDTO,
    GoalResponseDTO,
    BalanceResponseDTO,
    AddGoalResponseDTO,
    GoalDetailResponseDTO,
    GetAllGoalsResponseDTO,
    BaseResponseDTO
};

