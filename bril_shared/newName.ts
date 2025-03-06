let nameCounter = 0;

export function newName(oldName: string, sep?: string) {
    const s = sep ?? ":"
    return `${oldName}${s}${nameCounter++}${s}${Math.random().toString(36).substring(2)}`
}