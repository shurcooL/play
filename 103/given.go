package task

// Data<T> where T is int.
type DataᐸIntᐳ interface {
	IsCollection() bool
	GetCollection() CollectionᐸDataᐸIntᐳᐳ
	GetElement() int
}

// Java's Collection<E> interface (partial).

// Collection<E> where E is Data<int>.
type CollectionᐸDataᐸIntᐳᐳ interface {
	IsEmpty() bool
	Iterator() IteratorᐸDataᐸIntᐳᐳ
	Size() int
	// ... more methods are available in the real Java Collection<E> interface,
	// see http://docs.oracle.com/javase/7/docs/api/java/util/Collection.html.
}

// Iterator<E> where E is Data<int>.
type IteratorᐸDataᐸIntᐳᐳ interface {
	HasNext() bool
	Next() DataᐸIntᐳ
}
