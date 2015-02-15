package task

// Data<T> where T is int.
type DataInt interface {
	IsCollection() bool
	GetCollection() CollectionDataInt
	GetElement() int
}

// Java's Collection<E> interface (partial).

// Collection<E> where E is Data<int>.
type CollectionDataInt interface {
	IsEmpty() bool
	Iterator() IteratorDataInt
	Size() int
	// ... more methods are available in the real Java Collection<E> interface,
	// see http://docs.oracle.com/javase/7/docs/api/java/util/Collection.html.
}

// Iterator<E> where E is Data<int>.
type IteratorDataInt interface {
	HasNext() bool
	Next() DataInt
}
