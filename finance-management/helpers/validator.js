const { body, validationResult } = require('express-validator');

const loginValidatorRules = () => {
    return [
        // username must be filled
        body('username').notEmpty().withMessage('Please isi'),
        // password must be at least 8 chars long
        body('password').notEmpty().withMessage('Please isi'),
    ]
}

const registerValidatorRules = () => {
    return [
        body('name').notEmpty().withMessage('Invalid value'),
        body('email').notEmpty().isEmail().withMessage('Invalid value'),
        // username must be filled
        body('username').notEmpty().withMessage('Please isi'),
        // password must be at least 8 chars long
        body('password').isLength({ min: 8 }).withMessage('must be at least 8 chars long'),
    ]
}

const transactionValidatorRules = () => {
    return [
        body('description').notEmpty().withMessage('Invalid value'),
        body('category').notEmpty().withMessage('Invalid value'),
        body('amount').isNumeric().withMessage('Invalid value'),
        body('type').isIn(['income', 'outcome']).withMessage('Invalid value'),
        // body('time').isDate().withMessage('Invalid value'),
    ]
}


const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) {
        return next();
    }
    const extractedErrors = [];
    errors.array().map(err => extractedErrors.push({ [err.path]: err.msg }));

    return res.status(422).json({
        status: 0,
        message: 'invalid input',
        errors: extractedErrors,
    });
}

module.exports = {
    loginValidatorRules,
    transactionValidatorRules,
    registerValidatorRules,
    validate
}