package task

// deepIteratorᐸintᐳ is a basic implementation of DeepIteratorᐸTᐳ where T is int.
type deepIteratorᐸintᐳ struct {
	its     []IteratorᐸDataᐸintᐳᐳ
	hasNext bool
	next    int
}

func NewDeepIteratorᐸintᐳ(data Dataᐸintᐳ) DeepIteratorᐸintᐳ {
	if !data.IsCollection() {
		return &deepIteratorᐸintᐳ{
			hasNext: true,
			next:    data.Element(),
		}
	}
	di := &deepIteratorᐸintᐳ{
		its: []IteratorᐸDataᐸintᐳᐳ{data.Collection().Iterator()},
	}
	di.findNext()
	return di
}

// HasNext returns true if there's at least one more element available.
func (di *deepIteratorᐸintᐳ) HasNext() bool {
	return di.hasNext
}

// Next returns the next element.
// Next can only be called if HasNext returned true.
func (di *deepIteratorᐸintᐳ) Next() int {
	if !di.hasNext {
		panic("no next")
	}
	next := di.next
	di.findNext()
	return next
}

func (di *deepIteratorᐸintᐳ) findNext() {
	for len(di.its) > 0 {
		it := di.its[len(di.its)-1] // Deepest iterator on stack.
		if !it.HasNext() {
			di.its = di.its[:len(di.its)-1] // Pop empty collection iterator off stack.
			continue
		}
		data := it.Next()
		if data.IsCollection() {
			di.its = append(di.its, data.Collection().Iterator()) // Push new collection iterator onto stack.
			continue
		}
		di.hasNext = true
		di.next = data.Element()
		return
	}
	di.hasNext = false
}
