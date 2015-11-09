package task

// deepIteratorᐸintᐳ is a basic implementation of DeepIteratorᐸTᐳ where T is int.
type deepIteratorᐸintᐳ struct {
	its []IteratorᐸDataᐸintᐳᐳ
}

func NewDeepIteratorᐸintᐳ(c CollectionᐸDataᐸintᐳᐳ) DeepIteratorᐸintᐳ {
	topmostIterator := c.Iterator()
	return &deepIteratorᐸintᐳ{
		its: []IteratorᐸDataᐸintᐳᐳ{topmostIterator},
	}
}

// Next returns the next element.
func (di *deepIteratorᐸintᐳ) Next() int {
	if !di.HasNext() {
		panic("no next")
	}
	deepestIterator := di.its[len(di.its)-1]
	data := deepestIterator.Next()
	if !data.IsCollection() {
		return data.GetElement()
	} else {
		di.its = append(di.its, data.GetCollection().Iterator())
		return di.Next()
	}
}

// HasNext returns true if there's at least one more element available.
// Next can only be safely called if HasNext returns true.
func (di *deepIteratorᐸintᐳ) HasNext() bool {
	for {
		if len(di.its) == 0 {
			return false
		}
		deepestIterator := di.its[len(di.its)-1]
		if deepestIterator.HasNext() {
			return true
		} else {
			// We're done iterating over this collection, so pop the stack of iterators.
			di.its = di.its[:len(di.its)-1]
		}
	}
}
