const Goal = require('../models/goal.model');
const {
    AddGoalRequestDTO,
    UpdateGoalRequestDTO,
    AddGoalResponseDTO,
    GoalDetailResponseDTO,
    GetAllGoalsResponseDTO,
    BaseResponseDTO
} = require('../dtos/goal.dto');

const addGoal = async (req, res) => {
    try {
        const dto = new AddGoalRequestDTO(req.body);
        const errors = dto.validate();
        if (errors.length > 0) {
            return res.status(400).json(BaseResponseDTO.error('Validation failed', errors));
        }

        const goal = await Goal.create({
            user: req.user.id,
            description: dto.description.trim(),
            price: dto.price,
        });

        return res.status(201).json(BaseResponseDTO.success('Goal created successfully', new AddGoalResponseDTO(goal)));
    } catch (err) {
        return res.status(500).json(BaseResponseDTO.error('Failed to create goal', err.message));
    }
};

const getGoalDetail = async (req, res) => {
    try {
        const goal = await Goal.findOne({ _id: req.params.goal, user: req.user.id });
        if (!goal) return res.status(404).json(BaseResponseDTO.error('Goal not found'));
        return res.json(BaseResponseDTO.success('Goal detail retrieved', new GoalDetailResponseDTO(goal)));
    } catch (err) {
        return res.status(500).json(BaseResponseDTO.error('Failed to get goal detail', err.message));
    }
};

const getAllGoals = async (req, res) => {
    try {
        const goals = await Goal.find({ user: req.user.id }).sort({ achieve: 1, createdAt: -1 });
        return res.json(BaseResponseDTO.success('All goals retrieved', new GetAllGoalsResponseDTO(goals)));
    } catch (err) {
        return res.status(500).json(BaseResponseDTO.error('Failed to get goals', err.message));
    }
};

const updateGoal = async (req, res) => {
    try {
        const dto = new UpdateGoalRequestDTO(req.body);
        const errors = dto.validate();
        if (errors.length > 0) {
            return res.status(400).json(BaseResponseDTO.error('Validation failed', errors));
        }

        const patch = {};
        if (dto.savedAmount !== undefined) patch.savedAmount = dto.savedAmount;
        if (dto.achieve !== undefined)     patch.achieve = dto.achieve;
        if (dto.description !== undefined) patch.description = dto.description.trim();
        if (dto.price !== undefined)       patch.price = dto.price;

        // Auto-mark achieved when savedAmount reaches price
        if (patch.savedAmount !== undefined && patch.achieve === undefined) {
            // We need the current price to check — fetch it
            const existing = await Goal.findOne({ _id: req.params.id, user: req.user.id }).select('price');
            if (!existing) return res.status(404).json(BaseResponseDTO.error('Goal not found'));
            const targetPrice = patch.price ?? existing.price;
            if (patch.savedAmount >= targetPrice) patch.achieve = 1;
        }

        const goal = await Goal.findOneAndUpdate(
            { _id: req.params.id, user: req.user.id },
            { $set: patch },
            { new: true, runValidators: true }
        );
        if (!goal) return res.status(404).json(BaseResponseDTO.error('Goal not found'));

        return res.json(BaseResponseDTO.success('Goal updated', new GoalDetailResponseDTO(goal)));
    } catch (err) {
        return res.status(500).json(BaseResponseDTO.error('Failed to update goal', err.message));
    }
};

const deleteGoal = async (req, res) => {
    try {
        const goal = await Goal.findOneAndDelete({ _id: req.params.id, user: req.user.id });
        if (!goal) return res.status(404).json(BaseResponseDTO.error('Goal not found'));
        return res.json(BaseResponseDTO.success('Goal deleted'));
    } catch (err) {
        return res.status(500).json(BaseResponseDTO.error('Failed to delete goal', err.message));
    }
};

module.exports = { addGoal, getGoalDetail, getAllGoals, updateGoal, deleteGoal };
