const mongoose   = require('mongoose');
const Goal       = require('../models/goal.model');
const Allocation = require('../models/allocation.model');
const { AllocateRequestDTO, BaseResponseDTO } = require('../dtos/allocation.dto');
const { GoalResponseDTO } = require('../dtos/goal.dto');

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * POST /api/recommendations/allocate
 *
 * One-tap allocation of a cash-flow surplus or an income windfall into an
 * existing goal. This is the persistent action behind the surplus-sweep and
 * windfall nudges — the state it writes is what suppresses them.
 *
 * The money moves onto the goal's OWN savedAmount via an atomic `$inc` (never a
 * read-modify-write, never a shared pool — goal-progress architecture rule), and
 * an Allocation row is recorded so the prompting nudge no longer fires for the
 * same surplus month / windfall transaction.
 */
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

        // Atomic per-goal increment. Ownership is enforced in the same query so a
        // user can never fund another user's goal.
        const goal = await Goal.findOneAndUpdate(
            { _id: dto.goalId, user: userId },
            { $inc: { savedAmount: amount } },
            { new: true }
        );
        if (!goal) {
            return res.status(404).json(BaseResponseDTO.error('Goal not found'));
        }

        // Auto-mark achieved when the goal is now fully funded — mirrors updateGoal.
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
