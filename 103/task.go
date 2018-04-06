package task

// DeepIteratorᐸTᐳ where T is int. Performs depth-first iteration over all inner elements of DataᐸTᐳ.
type DeepIteratorᐸintᐳ interface {
	// HasNext returns true if there's at least one more element available.
	HasNext() bool

	// Next returns the next element.
	// Next can only be called if HasNext returned true.
	Next() int
}

// The task is to write code that implements DeepIteratorᐸTᐳ.
// See task_test.go for an example test case.
