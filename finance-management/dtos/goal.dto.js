const { BaseRequestDTO, BaseResponseDTO } = require('./base.dto');

class AddGoalRequestDTO extends BaseRequestDTO {
    constructor(data) {
        super(data);
        this.description = data.description;
        this.price = data.price;
    }

    validate() {
        const errors = [];
        if (!this.description || typeof this.description !== 'string' || !this.description.trim()) {
            errors.push('Description is required and must be a non-empty string');
        }
        if (this.price === undefined || typeof this.price !== 'number' || this.price <= 0) {
            errors.push('Price is required and must be a positive number');
        }
        return errors;
    }
}

class UpdateGoalRequestDTO extends BaseRequestDTO {
    constructor(data) {
        super(data);
        this.savedAmount = data.savedAmount;
        this.achieve = data.achieve;
        this.description = data.description;
        this.price = data.price;
    }

    validate() {
        const errors = [];
        if (this.savedAmount !== undefined) {
            if (typeof this.savedAmount !== 'number' || this.savedAmount < 0) {
                errors.push('savedAmount must be a non-negative number');
            }
        }
        if (this.achieve !== undefined && ![0, 1].includes(this.achieve)) {
            errors.push('achieve must be 0 or 1');
        }
        if (this.description !== undefined && (typeof this.description !== 'string' || !this.description.trim())) {
            errors.push('description must be a non-empty string');
        }
        if (this.price !== undefined && (typeof this.price !== 'number' || this.price <= 0)) {
            errors.push('price must be a positive number');
        }
        return errors;
    }
}

class GoalResponseDTO {
    constructor(goal) {
        this.id = goal._id;
        this.description = goal.description;
        this.price = goal.price;
        this.savedAmount = goal.savedAmount ?? 0;
        this.achieve = goal.achieve ?? 0;
        this.progress = goal.price > 0 ? Math.min(100, Math.round(((goal.savedAmount ?? 0) / goal.price) * 100)) : 0;
        this.createdAt = goal.createdAt;
        this.updatedAt = goal.updatedAt;
    }
}

class AddGoalResponseDTO {
    constructor(goal) {
        this.goal = new GoalResponseDTO(goal);
    }
}

class GoalDetailResponseDTO {
    constructor(goal) {
        this.goal = new GoalResponseDTO(goal);
    }
}

class GetAllGoalsResponseDTO {
    constructor(goals) {
        this.goals = goals.map(g => new GoalResponseDTO(g));
    }
}

module.exports = {
    AddGoalRequestDTO,
    UpdateGoalRequestDTO,
    GoalResponseDTO,
    AddGoalResponseDTO,
    GoalDetailResponseDTO,
    GetAllGoalsResponseDTO,
    BaseResponseDTO
};
