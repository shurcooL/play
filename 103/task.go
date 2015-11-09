package task

// DeepIteratorᐸTᐳ where T is int. Performs depth-first iteration over all inner elements of DataᐸTᐳ.
type DeepIteratorᐸintᐳ interface {
	HasNext() bool
	Next() int
}

// The task is to write code that implements DeepIteratorᐸTᐳ.
// See task_test.go for an example test case.
