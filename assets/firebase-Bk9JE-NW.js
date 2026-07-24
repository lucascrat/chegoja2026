import{r as w,g as O,a as I,L as z,_ as $,d as j,E as G,b as T,C as A,i as U,c as B,v as K,e as E,F as q,f as W,h as Y}from"./index.esm-BJUUkoS0.js";var N="firebase",V="12.16.0";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */w(N,V,"app");/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const g="analytics",H="firebase_id",Q="origin",X=60*1e3,J="https://firebase.googleapis.com/v1alpha/projects/-/apps/{app-id}/webConfig",b="https://www.googletagmanager.com/gtag/js";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const d=new z("@firebase/analytics");/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Z={"already-exists":"A Firebase Analytics instance with the appId {$id}  already exists. Only one Firebase Analytics instance can be created for each appId.","already-initialized":"initializeAnalytics() cannot be called again with different options than those it was initially called with. It can be called again with the same options to return the existing instance, or getAnalytics() can be used to get a reference to the already-initialized instance.","already-initialized-settings":"Firebase Analytics has already been initialized.settings() must be called before initializing any Analytics instanceor it will have no effect.","interop-component-reg-failed":"Firebase Analytics Interop Component failed to instantiate: {$reason}","invalid-analytics-context":"Firebase Analytics is not supported in this environment. Wrap initialization of analytics in analytics.isSupported() to prevent initialization in unsupported environments. Details: {$errorInfo}","indexeddb-unavailable":"IndexedDB unavailable or restricted in this environment. Wrap initialization of analytics in analytics.isSupported() to prevent initialization in unsupported environments. Details: {$errorInfo}","fetch-throttle":"The config fetch request timed out while in an exponential backoff state. Unix timestamp in milliseconds when fetch request throttling ends: {$throttleEndTimeMillis}.","config-fetch-failed":"Dynamic config fetch failed: [{$httpStatus}] {$responseMessage}","no-api-key":'The "apiKey" field is empty in the local Firebase config. Firebase Analytics requires this field tocontain a valid API key.',"no-app-id":'The "appId" field is empty in the local Firebase config. Firebase Analytics requires this field tocontain a valid app ID.',"no-client-id":'The "client_id" field is empty.',"invalid-gtag-resource":"Trusted Types detected an invalid gtag resource: {$gtagURL}."},f=new G("analytics","Analytics",Z);/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function ee(e){if(!e.startsWith(b)){const t=f.create("invalid-gtag-resource",{gtagURL:e});return d.warn(t.message),""}return e}function S(e){return Promise.all(e.map(t=>t.catch(n=>n)))}function te(e,t){let n;return window.trustedTypes&&(n=window.trustedTypes.createPolicy(e,t)),n}function ne(e,t){const n=te("firebase-js-sdk-policy",{createScriptURL:ee}),s=document.createElement("script"),i=`${b}?l=${e}&id=${t}`;s.src=n?n==null?void 0:n.createScriptURL(i):i,s.async=!0,document.head.appendChild(s)}function ie(e){let t=[];return Array.isArray(window[e])?t=window[e]:window[e]=t,t}async function ae(e,t,n,s,i,a){const r=s[i];try{if(r)await t[r];else{const c=(await S(n)).find(l=>l.measurementId===i);c&&await t[c.appId]}}catch(o){d.error(o)}e("config",i,a)}async function se(e,t,n,s,i){try{let a=[];if(i&&i.send_to){let r=i.send_to;Array.isArray(r)||(r=[r]);const o=await S(n);for(const c of r){const l=o.find(u=>u.measurementId===c),p=l&&t[l.appId];if(p)a.push(p);else{a=[];break}}}a.length===0&&(a=Object.values(t)),await Promise.all(a),e("event",s,i||{})}catch(a){d.error(a)}}function re(e,t,n,s){async function i(a,...r){try{if(a==="event"){const[o,c]=r;await se(e,t,n,o,c)}else if(a==="config"){const[o,c]=r;await ae(e,t,n,s,o,c)}else if(a==="consent"){const[o,c]=r;e("consent",o,c)}else if(a==="get"){const[o,c,l]=r;e("get",o,c,l)}else if(a==="set"){const[o]=r;e("set",o)}else e(a,...r)}catch(o){d.error(o)}}return i}function oe(e,t,n,s,i){let a=function(...r){window[s].push(arguments)};return window[i]&&typeof window[i]=="function"&&(a=window[i]),window[i]=re(a,e,t,n),{gtagCore:a,wrappedGtag:window[i]}}function ce(e){const t=window.document.getElementsByTagName("script");for(const n of Object.values(t))if(n.src&&n.src.includes(b)&&n.src.includes(e))return n;return null}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const le=30,de=1e3;class fe{constructor(t={},n=de){this.throttleMetadata=t,this.intervalMillis=n}getThrottleMetadata(t){return this.throttleMetadata[t]}setThrottleMetadata(t,n){this.throttleMetadata[t]=n}deleteThrottleMetadata(t){delete this.throttleMetadata[t]}}const x=new fe;function ue(e){return new Headers({Accept:"application/json","x-goog-api-key":e})}async function pe(e){var r;const{appId:t,apiKey:n}=e,s={method:"GET",headers:ue(n)},i=J.replace("{app-id}",t),a=await fetch(i,s);if(a.status!==200&&a.status!==304){let o="";try{const c=await a.json();(r=c.error)!=null&&r.message&&(o=c.error.message)}catch{}throw f.create("config-fetch-failed",{httpStatus:a.status,responseMessage:o})}return a.json()}async function me(e,t=x,n){const{appId:s,apiKey:i,measurementId:a}=e.options;if(!s)throw f.create("no-app-id");if(!i){if(a)return{measurementId:a,appId:s};throw f.create("no-api-key")}const r=t.getThrottleMetadata(s)||{backoffCount:0,throttleEndTimeMillis:Date.now()},o=new ye;return setTimeout(async()=>{o.abort()},X),L({appId:s,apiKey:i,measurementId:a},r,o,t)}async function L(e,{throttleEndTimeMillis:t,backoffCount:n},s,i=x){var o;const{appId:a,measurementId:r}=e;try{await he(s,t)}catch(c){if(r)return d.warn(`Timed out fetching this Firebase app's measurement ID from the server. Falling back to the measurement ID ${r} provided in the "measurementId" field in the local Firebase config. [${c==null?void 0:c.message}]`),{appId:a,measurementId:r};throw c}try{const c=await pe(e);return i.deleteThrottleMetadata(a),c}catch(c){const l=c;if(!ge(l)){if(i.deleteThrottleMetadata(a),r)return d.warn(`Failed to fetch this Firebase app's measurement ID from the server. Falling back to the measurement ID ${r} provided in the "measurementId" field in the local Firebase config. [${l==null?void 0:l.message}]`),{appId:a,measurementId:r};throw c}const p=Number((o=l==null?void 0:l.customData)==null?void 0:o.httpStatus)===503?E(n,i.intervalMillis,le):E(n,i.intervalMillis),u={throttleEndTimeMillis:Date.now()+p,backoffCount:n+1};return i.setThrottleMetadata(a,u),d.debug(`Calling attemptFetch again in ${p} millis`),L(e,u,s,i)}}function he(e,t){return new Promise((n,s)=>{const i=Math.max(t-Date.now(),0),a=setTimeout(n,i);e.addEventListener(()=>{clearTimeout(a),s(f.create("fetch-throttle",{throttleEndTimeMillis:t}))})})}function ge(e){if(!(e instanceof q)||!e.customData)return!1;const t=Number(e.customData.httpStatus);return t===429||t===500||t===503||t===504}class ye{constructor(){this.listeners=[]}addEventListener(t){this.listeners.push(t)}abort(){this.listeners.forEach(t=>t())}}async function we(e,t,n,s,i){if(i&&i.global){e("event",n,s);return}else{const a=await t,r={...s,send_to:a};e("event",n,r)}}async function Ie(e,t,n,s){if(s&&s.global){const i={};for(const a of Object.keys(n))i[`user_properties.${a}`]=n[a];return e("set",i),Promise.resolve()}else{const i=await t;e("config",i,{update:!0,user_properties:n})}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function be(){if(B())try{await K()}catch(e){return d.warn(f.create("indexeddb-unavailable",{errorInfo:e==null?void 0:e.toString()}).message),!1}else return d.warn(f.create("indexeddb-unavailable",{errorInfo:"IndexedDB is not available in this environment."}).message),!1;return!0}async function ve(e,t,n,s,i,a,r){const o=me(e);o.then(m=>{n[m.measurementId]=m.appId,e.options.measurementId&&m.measurementId!==e.options.measurementId&&d.warn(`The measurement ID in the local Firebase config (${e.options.measurementId}) does not match the measurement ID fetched from the server (${m.measurementId}). To ensure analytics events are always sent to the correct Analytics property, update the measurement ID field in the local config or remove it from the local config.`)}).catch(m=>d.error(m)),t.push(o);const c=be().then(m=>{if(m)return s.getId()}),[l,p]=await Promise.all([o,c]);ce(a)||ne(a,l.measurementId),i("js",new Date);const u=(r==null?void 0:r.config)??{};return u[Q]="firebase",u.update=!0,p!=null&&(u[H]=p),i("config",l.measurementId,u),l.measurementId}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Te{constructor(t){this.app=t}_delete(){return delete h[this.app.options.appId],Promise.resolve()}}let h={},M=[];const R={};let y="dataLayer",Ae="gtag",C,v,D=!1;function Ee(){const e=[];if(U()&&e.push("This is a browser extension environment."),W()||e.push("Cookies are not available."),e.length>0){const t=e.map((s,i)=>`(${i+1}) ${s}`).join(" "),n=f.create("invalid-analytics-context",{errorInfo:t});d.warn(n.message)}}function Me(e,t,n){Ee();const s=e.options.appId;if(!s)throw f.create("no-app-id");if(!e.options.apiKey)if(e.options.measurementId)d.warn(`The "apiKey" field is empty in the local Firebase config. This is needed to fetch the latest measurement ID for this Firebase app. Falling back to the measurement ID ${e.options.measurementId} provided in the "measurementId" field in the local Firebase config.`);else throw f.create("no-api-key");if(h[s]!=null)throw f.create("already-exists",{id:s});if(!D){ie(y);const{wrappedGtag:a,gtagCore:r}=oe(h,M,R,y,Ae);v=a,C=r,D=!0}return h[s]=ve(e,M,R,t,C,y,n),new Te(e)}function Re(e=O()){e=I(e);const t=$(e,g);return t.isInitialized()?t.getImmediate():Ce(e)}function Ce(e,t={}){const n=$(e,g);if(n.isInitialized()){const i=n.getImmediate();if(j(t,n.getOptions()))return i;throw f.create("already-initialized")}return n.initialize({options:t})}function De(e,t,n){e=I(e),Ie(v,h[e.app.options.appId],t,n).catch(s=>d.error(s))}function k(e,t,n,s){e=I(e),we(v,h[e.app.options.appId],t,n,s).catch(i=>d.error(i))}const F="@firebase/analytics",_="0.10.22";function Fe(){T(new A(g,(t,{options:n})=>{const s=t.getProvider("app").getImmediate(),i=t.getProvider("installations-internal").getImmediate();return Me(s,i,n)},"PUBLIC")),T(new A("analytics-internal",e,"PRIVATE")),w(F,_),w(F,_,"esm2020");function e(t){try{const n=t.getProvider(g).getImmediate();return{logEvent:(s,i,a)=>k(n,s,i,a),setUserProperties:(s,i)=>De(n,s,i)}}catch(n){throw f.create("interop-component-reg-failed",{reason:n})}}}Fe();const _e={apiKey:"AIzaSyCsg7rA0tkNqq7UtMjGKDThlTytfma58ig",authDomain:"chegoja-pro-b0f2a.firebaseapp.com",projectId:"chegoja-pro-b0f2a",storageBucket:"chegoja-pro-b0f2a.firebasestorage.app",messagingSenderId:"514748537390",appId:"1:514748537390:web:05882c6426bd78c8e5ddbf",measurementId:"G-4RWQKCG3VX"},Pe=Y(_e),P=typeof window<"u"?Re(Pe):null,Se=(e,t)=>{P&&k(P,e,t)};export{P as analytics,Pe as app,Se as logFirebaseEvent};
