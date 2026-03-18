const moment = require('moment-timezone');
const User = require('../models/user.model');
const Balance = require('../models/balance.model');
const Goal = require('../models/goal.model');
const {
    AddGoalRequestDTO,
    AddGoalResponseDTO,
    GoalDetailResponseDTO,
    GetAllGoalsResponseDTO,
    BaseResponseDTO
} = require('../dtos/goal.dto');

const addGoal = async (req, res, next) => {
    try {
        // Validate request data
        const goalDTO = new AddGoalRequestDTO(req.body);
        const validationErrors = goalDTO.validate();
        if (validationErrors.length > 0) {
            return res.status(400).json(BaseResponseDTO.error('Validation failed', validationErrors));
        }

        const newGoal = new Goal({
            user: req.user.id,
            description: goalDTO.description,
            price: goalDTO.price
        });

        const savedGoal = await newGoal.save();

        // Return DTO response
        const responseDTO = new AddGoalResponseDTO(savedGoal);
        res.status(201).json(BaseResponseDTO.success('Goal created successfully', responseDTO));

    } catch (error) {
        res.status(500).json(BaseResponseDTO.error('Failed to create goal', error.message));
    }
}

const getGoalDetail = async (req, res, next) => {
    try {
        const goal = await Goal.findOne({ 
            _id: req.params.goal, 
            user: req.user.id 
        }).exec();
        
        if (!goal) {
            return res.status(404).json(BaseResponseDTO.error('Goal not found'));
        }

        const balance = await Balance.findOne({ user: req.user.id }).exec();
        if (!balance) {
            return res.status(404).json(BaseResponseDTO.error('User balance not found'));
        }

        const savings = (20 * balance.amount) / 100; // get 20% of balance to goal
        const need = goal.price - savings;

        // Return DTO response
        const responseDTO = new GoalDetailResponseDTO(goal, balance, savings, need);
        res.status(200).json(BaseResponseDTO.success('Goal detail retrieved', responseDTO));

    } catch (error) {
        res.status(500).json(BaseResponseDTO.error('Failed to get goal detail', error.message));
    }
}

const getAllGoals = async (req, res, next) => {
    try {
        const goals = await Goal.find({ user: req.user.id }).exec();

        // Return DTO response
        const responseDTO = new GetAllGoalsResponseDTO(goals);
        res.status(200).json(BaseResponseDTO.success('All goals retrieved', responseDTO));

    } catch (error) {
        res.status(500).json(BaseResponseDTO.error('Failed to get goals', error.message));
    }
}

module.exports = {
    addGoal,
    getGoalDetail,
    getAllGoals
}