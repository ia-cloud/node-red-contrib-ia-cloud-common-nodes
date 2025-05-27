/*
 * Copyright 204 Hiro Hashimukai on the ia-cloud project

 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

class JsonParseError extends Error {
    constructor(...args) {
        super(...args);
        this.name = this.constructor.name;
        this.message = "Bad Response JSON";
        this.code = "JSON_PARSE_ERR";
        if (Error.captureStackTrace) Error.captureStackTrace(this, JsonParseError);
    }
}

class IaCloudLowerError extends Error {
    constructor(...args) {
        super(...args);
        this.name = this.constructor.name;
        this.message = "ia-cloud Lower protocol Error";
        this.code = "IACLOUD_LOWER_ERR";
        if (Error.captureStackTrace) Error.captureStackTrace(this, IaCloudLowerError);
    }
}

class IaCloudAPIError extends Error {
    constructor(...args) {
        super(...args);
        this.name = this.constructor.name;
        this.message = "ia-cloud API Error";
        this.code = "IACLOUD_API_ERR";
        if (Error.captureStackTrace) Error.captureStackTrace(this, IaCloudAPIError);
    }
}
class IaCloudTimeoutError extends Error {
    constructor(...args) {
        super(...args);
        this.name = this.constructor.name;
        this.message = "ia-cloud timed out Error";
        this.code = "IACLOUD_TIMEDOUT_ERR";
        if (Error.captureStackTrace) Error.captureStackTrace(this, IaCloudTimeoutError);
    }
}
module.exports = {
    JsonParseError,
    IaCloudLowerError,
    IaCloudAPIError,
    IaCloudTimeoutError
};