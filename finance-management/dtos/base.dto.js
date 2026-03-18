/**
 * Base response DTO structure
 */
class BaseResponseDTO {
    constructor(status, message, data = null, error = null) {
        this.status = status;
        this.message = message;
        if (data !== null) this.data = data;
        if (error !== null) this.error = error;
    }

    static success(message, data = null) {
        return new BaseResponseDTO(1, message, data);
    }

    static error(message, error = null) {
        return new BaseResponseDTO(0, message, null, error);
    }
}

/**
 * Base request DTO for validation
 */
class BaseRequestDTO {
    constructor(data) {
        Object.assign(this, data);
    }

    validate() {
        const errors = [];
        // Override in child classes for specific validation
        return errors;
    }
}

module.exports = {
    BaseResponseDTO,
    BaseRequestDTO
};

