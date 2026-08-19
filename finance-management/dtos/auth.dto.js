const { BaseRequestDTO, BaseResponseDTO } = require('./base.dto');

class RegisterRequestDTO extends BaseRequestDTO {
    constructor(data) {
        super(data);
        this.name = data.name;
        this.username = data.username;
        this.email = data.email;
        this.password = data.password;
    }

    validate() {
        const errors = [];
        if (!this.name || typeof this.name !== 'string') {
            errors.push('Name is required and must be a string');
        }
        if (!this.username || typeof this.username !== 'string') {
            errors.push('Username is required and must be a string');
        }
        if (!this.email || typeof this.email !== 'string') {
            errors.push('Email is required and must be a string');
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
            errors.push('Email must be a valid email address');
        }
        if (!this.password || typeof this.password !== 'string') {
            errors.push('Password is required and must be a string');
        }
        return errors;
    }
}

class LoginRequestDTO extends BaseRequestDTO {
    constructor(data) {
        super(data);
        // 'username' is the legacy field name, still accepted.
        this.identifier = data.identifier || data.username;
        this.password = data.password;
    }

    validate() {
        const errors = [];
        if (!this.identifier || typeof this.identifier !== 'string') {
            errors.push('Username or email is required');
        }
        if (!this.password || typeof this.password !== 'string') {
            errors.push('Password is required and must be a string');
        }
        return errors;
    }
}

class UserResponseDTO {
    constructor(user) {
        this.id = user._id;
        this.name = user.name;
        this.username = user.username;
        this.email = user.email;
        this.createdAt = user.createdAt;
    }
}

class BalanceResponseDTO {
    constructor(balance) {
        this.id = balance._id;
        this.amount = balance.amount;
        this.updatedAt = balance.updatedAt;
    }
}

class RegisterResponseDTO {
    constructor(user, balance) {
        this.user = new UserResponseDTO(user);
        this.balance = new BalanceResponseDTO(balance);
    }
}

class LoginResponseDTO {
    constructor(token, user) {
        this.token = token;
        this.token_type = 'bearer';
        this.user = {
            id: user._id,
            name: user.name
        };
    }
}

class AuthCheckResponseDTO {
    constructor(isAuthorized) {
        this.authorized = isAuthorized;
    }
}

module.exports = {
    RegisterRequestDTO,
    LoginRequestDTO,
    UserResponseDTO,
    BalanceResponseDTO,
    RegisterResponseDTO,
    LoginResponseDTO,
    AuthCheckResponseDTO,
    BaseResponseDTO
};

