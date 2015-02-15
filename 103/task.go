package task

// DeepIterator<T> where T is int. Performs depth-first iteration over all inner elements of Data<T>.
type DeepIteratorᐸIntᐳ interface {
	HasNext() bool
	Next() int
}

// The task is to write code that implements DeepIterator<T>.
// See task_test.go for an example test case.
