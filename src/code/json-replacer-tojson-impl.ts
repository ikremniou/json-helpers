import type { JSONReplacer } from './json-parser';
import type { JSONReplacerData } from './json-formatter';

function findFunctionPrototype(objectConstructor: Function, name: string): [any, PropertyDescriptor] | null {
    let proto = objectConstructor.prototype;
    let toJSONDescriptor = Object.getOwnPropertyDescriptor(proto, name);
    if (toJSONDescriptor) {
        return [proto, toJSONDescriptor];
    }
    else {
        proto = Object.getPrototypeOf(objectConstructor);
        while (proto) {
            toJSONDescriptor = Object.getOwnPropertyDescriptor(proto, name);
            if (toJSONDescriptor) {
                return [proto, toJSONDescriptor];
            }
            proto = Object.getPrototypeOf(proto);
        }
    }
    return null;
}

// Purpose is to manage 'Buffer', 'Date', 'Error', 'TypeError'
class JSONReplacerSetup<T extends Object> implements JSONReplacerData<T> {
    objectType: string;
    // objectInstance: T;
    objectConstructor: ObjectConstructor;
    serialize: (t: T) => any;
    
    protected _toJSONDescriptor: PropertyDescriptor;
    protected _toOriginalDescriptor: [any, PropertyDescriptor];

    constructor(replacer: JSONReplacerData<T>) {
        // Object.assign(this, replacer);
        this.objectType = replacer.objectType;
        this.objectConstructor = replacer.objectConstructor;
        this.serialize = replacer.serialize;

        // const objectConstructor = replacer.objectInstance.constructor;
        const objectConstructor = this.objectConstructor;
        this._toOriginalDescriptor = findFunctionPrototype(objectConstructor, 'toJSON');
        if (this._toOriginalDescriptor == null) {
            this._toOriginalDescriptor = [
                objectConstructor.prototype,
                {
                    value: undefined,
                    configurable: true,
                    enumerable: false,
                    writable: true
                }
            ];
        }

        if (this.serialize) {
            const self = this;
            this._toJSONDescriptor = {
                // Beware the 'this' context is the object instance itself
                value: function (): any {
                    return { type: self.objectType, data: self.serialize(this as T) };
                },
                configurable: true,
                enumerable: false,
                writable: true
            };
        }
    }

    install() {
        if (this.serialize) {
            try {
                Object.defineProperty(this._toOriginalDescriptor[0], 'toJSON', this._toJSONDescriptor);
            }
            catch (err) {
                console.error(`${err}`);
            }
        }
    }

    uninstall() {
        if (this.serialize) {
            try {
                Object.defineProperty(this._toOriginalDescriptor[0], 'toJSON', this._toOriginalDescriptor[1]);
            }
            catch (err) {
            }
        }
    }

    // // /!\ /!\ /!\ /!\ /!\ /!\ /!\ /!\
    // // For test purpose, not called
    // // /!\ /!\ /!\ /!\ /!\ /!\ /!\ /!\
    // delete() {
    //     if (this.serialize) {
    //         try {
    //             if (this._toJSONDescriptor) {
    //                 const self = this;
    //                 Object.defineProperty(this._objectConstructor.prototype, 'toJSON', self._toJSONDescriptor);
    //             }
    //             else {
    //                 delete (this._objectConstructor.prototype as any)['toJSON' ];
    //             }
    //         }
    //         catch (err) {
    //         }
    //     }
    // }
}

/** @internal */
export class JSONReplacerToJSONImpl implements JSONReplacer {
    private _jsonReplacerSetupsMap: Map<Object, JSONReplacerSetup<any>>;
    private _installed: number;

    constructor() {
        this._jsonReplacerSetupsMap = new Map<Object, JSONReplacerSetup<any>>();
        this._installed = 0;
    }

    replacer<T>(replacer: JSONReplacerData<T>) {
        const setup = new JSONReplacerSetup<T>(replacer);
        if (replacer.serialize) {
            this._jsonReplacerSetupsMap.set(setup.objectConstructor, setup);
        }
        else {
            this._jsonReplacerSetupsMap.delete(setup.objectConstructor);
        }
    }

    install(): void {
        if (this._installed++ === 0) {
            this._jsonReplacerSetupsMap.forEach((item) => {
                item.install();
            });
        }
    }

    uninstall(): void {
        if (--this._installed === 0) {
            this._jsonReplacerSetupsMap.forEach((item) => {
                item.uninstall();
            });
        }
    }

    stringify(value: any, replacer?: (key: string, value: any) => any, space?: string | number): string {
        try {
            this.install();
            const result = JSON.stringify(value, replacer, space);
            this.uninstall();
            return result;
        }
        catch (err) {
            this.uninstall();
            throw err;
        }
    }
}

