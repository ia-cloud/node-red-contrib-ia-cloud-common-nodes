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

const {iaCloudConnection} = require("@ia-cloud/node-red-contrib-ia-cloud-common-nodes");
const CNCT_RETRY_INIT = 30 * 1000;      //リトライ間隔の初期値30秒

module.exports = function(RED) {

    class IaCloudInvalidProtocol extends Error {
        constructor(...args) {
            super(...args);
            this.name = this.constructor.name;
            this.message = "ia-cloud invalid protocol";
            this.code = "IACLOUD_INVALID_PROTOCOL";
            if (Error.captureStackTrace) Error.captureStackTrace(this, IaCloudInvalidProtocol);
        }
    }

    function ccsConnectionConfigII(config) {
        RED.nodes.createNode(this,config);

        let node = this;
        let cnctRtryId;     // connect retry timer ID
        let cnctRtryFlag = true;
        let tappTimerId;    // tapping CCS (getStatus()) interval timer ID

        // 接続情報を保持するオブジェクト
        let info = {
            status: "Disconnected",
            serviceID: "",
            version: config.version,
            url: config.url,
            protocol: "",
            userID: node.credentials.userId,
            FDSKey: config.FDSKey,
            FDSType: "iaCloudFDS",
            cnctTs:"",
            lastReqTs: "",
            comment: config.comment,
            // max retry interval
            cnctRetryInterval: config.cnctRetryInterval * 60 * 1000,
            tappingInterval: config.tappingInterval * 60 * 60 * 1000,
            proxy: config.proxy,
            reqTimeout: 120000
        };

        let auth = {
            username: node.credentials.userId,
            password: node.credentials.password,
        };

        // environmental proxy setting
        if (!info.proxy) {
            let prox;
            let noprox;
            if (process.env.http_proxy != null) { prox = process.env.http_proxy; }
            if (process.env.HTTP_PROXY != null) { prox = process.env.HTTP_PROXY; }
            if (process.env.no_proxy != null) { noprox = process.env.no_proxy.split(","); }
            if (process.env.NO_PROXY != null) { noprox = process.env.NO_PROXY.split(","); }
            info.proxy = "";
            if (noprox) {
                for (let i in noprox) {
                    if (info.url.indexOf(noprox[i]) === -1) { info.proxy = prox; }
                }
            }
        }
        // proxy server address check
        if (info.proxy) {
            let match = info.proxy.match(/^(http:\/\/)?(.+)?:([0-9]+)?/i);
            if (!match) {
                node.warn("Bad proxy url: "+ info.proxy);
                info.proxy = "";
            }
        }
        
        // set ia-cloud api protocol
        try {
            if (!info.version || info.version === "V1") info.protocol = "REST1";
            else if (info.version === "V2") {
                const url = new URL(info.url);
                if (url.protocol === "https:") info.protocol = "REST2";
                else if (url.protocol === "wss:" || url.protocol === "ws:") info.protocol = "websocket";
                else throw new Error();
            }
        }
        catch (err) {
            node.error((new IaCloudInvalidProtocol(err)).message);
        }

        // このタイムアウトの設定の詳細を調査する必要あり
        if (RED.settings.httpRequestTimeout) {
            info.reqTimeout = parseInt(RED.settings.httpRequestTimeout) || 120000;
        }
        else { info.reqTimeout = 120000; }

        this.cnctInfoName = "ia-cloud-connection-" + info.FDSKey.replace(/\s+/g, "_");
        let gContext = this.context().global;
        gContext.set(this.cnctInfoName, info);

        // ia-cloudconnection class
        const iaC = new iaCloudConnection(gContext, this.cnctInfoName, auth);

        //connect request を送出（接続状態にないときは最大cnctRetryIntervalで繰り返し）

        let rInt = CNCT_RETRY_INIT;   //リトライ間隔の初期値
        // connectリクエストのトライループ
        (async function cnctTry() {

            //非接続状態なら接続トライ
            if (info.status === "Disconnected") {

                // connect リクエスト
                try {
                    let res = await iaC.connect(auth);
                    rInt = CNCT_RETRY_INIT;   // reset retry interval
                    node.debug("connect: " + res.serviceID);
                } catch (error) {
                    node.debug(error.message);
                    //retryの設定。倍々で間隔を伸ばし最大はcnctRetryInterval、
                    if (info.cnctRetryInterval !== 0) {
                        rInt *= 2;
                        rInt = (rInt < info.cnctRetryInterval)? rInt: info.cnctRetryInterval;
                    }  
                }
            } else {
                rInt = CNCT_RETRY_INIT;
            }
            // connect retry loop
            if (info.cnctRetryInterval !== 0 && cnctRtryFlag) 
                cnctRtryId = setTimeout(cnctTry, rInt);

        }());

        if (info.tappingInterval !== 0) {
            tappTimerId = setInterval(function(){

                //非接続状態の時は、何もしない。
                if (info.status === "Disconnected") return;

                (async () => {
                    // getStatus request
                    try {
                        let res = await iaC.getStatus();
                        node.debug("getStatus: " + res.newServiceID);
                    } catch (error) {
                        node.error(error.message);
                    } 
                })();
            }, info.tappingInterval) ;
        }

        this.iaCloudCommand = async (cmnd, dataObject) => {
            // try-catchする必要あり
            try {
                let resp;
                switch (cmnd) {
                    case "store":
                        resp = await iaC.store(dataObject)
                        break;
                    case "retrieve":
                        resp = await iaC.retrieve(dataObject)
                        break;
                    case "retrieveArray":
                        resp = await iaC.retrieveArray(dataObject)
                        break;
                    case "convey":
                        resp = await iaC.convey(dataObject)
                        break;
                    default:
                        throw new IaCloudInvalidProtocol();
                }
                return resp;
            } 
            catch(error) {
                throw error;
            }
        }

        this.closeConnection = async () => {
            let res;
            (async () => {
                //非接続状態の時は、何もせずdone()
                if (info.status !== "Disconnected") {
                    // terminate request
                    try { 
                        return await iaC.terminate();
                    }
                    catch (error) { 
                        throw error;
                    } 
                }
            })();
        };
        this.on ("close", async (done ) => {

            // stop timers for the tapping and the connect retry
            clearInterval(tappTimerId);
            clearTimeout(cnctRtryId);

            if (info.status !== "Disconnected") {
                // terminate request
                try { 
                    let res = await iaC.terminate();
                    node.debug(JSON.stringify(res));
                }
                catch (error) { 
                    node.debug(error.message);
                }
            }
            done();
        });
    }

    RED.nodes.registerType("ia-cloud-ccs-connection-configII",ccsConnectionConfigII,{
        credentials: {
            userId: {type:"text"},
            password: {type: "password"}

        }
    });
}