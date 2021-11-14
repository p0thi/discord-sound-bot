import assert from "node:assert";

export default class FixedLengthQueue<T> {
    readonly _size: number;
    private readonly _array: T[] = []

    constructor(size: number, initialValues?: T[]) {
        assert(size > 0);

        if (initialValues) {
            if (initialValues.length > size) {
                throw new Error("initial values length is bigger then maximum size")
            }
            this._array = initialValues
        }
        this._size = size;
    }

    get length(): number {
        return this._array.length
    }

    get maxLength(): number {
        return this._size;
    }

    get firstItem(): T {
        return this.get(0)
    }

    get lastItem(): T {
        return this.get(this.length - 1);
    }

    get isFull(): boolean {
        return this.length >= this.maxLength;
    }

    push(...args: T[]): void {
        this._array.push(...args)
        while (this._array.length > this._size) {
            this._array.shift();
        }
    }

    get(index: number): T {
        return this._array[index]
    }
}
