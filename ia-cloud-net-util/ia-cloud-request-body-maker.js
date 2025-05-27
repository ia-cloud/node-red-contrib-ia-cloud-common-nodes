/*
 * Copyright 2025 Hiro Hashimukai on the ia-cloud project

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
const Stream = require("stream");

const iaCReqBodyMaker = (reqBody, objStream) => {

    try {
        // if request body is not stream, make it
        let reqBodyJson = JSON.stringify(reqBody);
        let objStrArray = reqBodyJson.split("__= file content__");
        let reqBodyStream;

        // make request stream with objectStream、if exist.
        if (objStrArray.length !== 1 && objStream) {

            // prepare stream for request body
            reqBodyStream = new Stream.PassThrough();
            // write first part of request body json string
            reqBodyStream.write(objStrArray[0]);
            objStream.pip(reqBodyStream);
            reqBodyStream.write(objStrArray[1]);
        }
        else {
            reqBodyStream = Stream.Readable.from(reqBodyJson);
        }
        return reqBodyStream;

    } catch(err) {
        throw err;
    }
}
module.exports = iaCReqBodyMaker;