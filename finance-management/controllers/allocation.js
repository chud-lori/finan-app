const mongoose   = require('mongoose');
const Goal       = require('../models/goal.model');
const Allocation = require('../models/allocation.model');
const { AllocateRequestDTO, BaseResponseDTO } = require('../dtos/allocation.dto');
const { GoalResponseDTO } = require('../dtos/goal.dto');

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// The Allocation row written here is what suppresses the surplus-sweep / windfall nudge.
const allocate = async (req, res) => {
    const userId = req.user.id;
    const dto    = new AllocateRequestDTO(req.body || {});
    const errors = dto.validate();
    if (errors.length) {
        return res.status(400).json(BaseResponseDTO.error('Validation failed', errors));
    }
    if (!isValidId(dto.goalId)) {
        return res.status(400).json(BaseResponseDTO.error('Invalid goal id'));
    }

    try {
        const amount = Math.round(dto.amount);

        // Atomic $inc on the goal's own savedAmount — never a shared pool; ownership filtered in the same query.
        const goal = await Goal.findOneAndUpdate(
            { _id: dto.goalId, user: userId },
            { $inc: { savedAmount: amount } },
            { new: true }
        );
        if (!goal) {
            return res.status(404).json(BaseResponseDTO.error('Goal not found'));
        }

        if (goal.achieve !== 1 && goal.savedAmount >= goal.price) {
            goal.achieve = 1;
            await goal.save();
        }

        await Allocation.create({
            user:      userId,
            source:    dto.source,
            sourceKey: dto.sourceKey,
            goal:      goal._id,
            amount,
        });

        return res.json(BaseResponseDTO.success('Allocation applied', {
            goal:      new GoalResponseDTO(goal),
            allocated: amount,
        }));
    } catch (err) {
        return res.status(500).json(BaseResponseDTO.error('Failed to allocate'));
    }
};

module.exports = { allocate };
