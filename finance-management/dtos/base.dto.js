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

class BaseRequestDTO {
    constructor(data) {
        // A JSON body may carry __proto__; Object.assign routes it through the
        // prototype setter and strips every method off this instance.
        for (const key of Object.keys(Object(data))) {
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
            this[key] = data[key];
        }
    }

    validate() {
        const errors = [];
        return errors;
    }
}

module.exports = {
    BaseResponseDTO,
    BaseRequestDTO
};

