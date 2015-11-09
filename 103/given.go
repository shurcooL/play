package task

// Data<T> where T is int.
type Dataᐸintᐳ interface {
	IsCollection() bool
	GetCollection() CollectionᐸDataᐸintᐳᐳ
	GetElement() int
}

// Java's Collection<E> interface (partial).

// Collection<E> where E is Data<int>.
type CollectionᐸDataᐸintᐳᐳ interface {
	IsEmpty() bool
	Iterator() IteratorᐸDataᐸintᐳᐳ
	Size() int
	// ... more methods are available in the real Java Collection<E> interface,
	// see http://docs.oracle.com/javase/7/docs/api/java/util/Collection.html.
}

// Iterator<E> where E is Data<int>.
type IteratorᐸDataᐸintᐳᐳ interface {
	HasNext() bool
	Next() Dataᐸintᐳ
}
