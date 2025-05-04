// DOM Elements
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const resultsBody = document.getElementById('resultsBody');
const dispensarySelect = document.getElementById('dispensarySelect');
const searchModeWrapper = document.createElement('div');
const resultsTable = document.getElementById('resultsTable');
const resultsSection = document.querySelector('.results-section');

// API Endpoints
const API_BASE_URL = '/api';
const SEARCH_ENDPOINT = `${API_BASE_URL}/products/search`;
const SIMILAR_SEARCH_ENDPOINT = `${API_BASE_URL}/products/similar`;
const DISPENSARIES_ENDPOINT = `${API_BASE_URL}/dispensaries`;
const PRODUCTS_ENDPOINT = `${API_BASE_URL}/products`;

// State
let allProducts = [];
let dispensaries = [];
let currentViewMode = 'table'; // 'table' or 'similar'
let currentProductId = null;

// Initialize the app
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Add search mode selector
  setupSearchModeSelector();
  
  // Load dispensaries for the filter dropdown
  await loadDispensaries();
  
  // Add event listeners
  searchButton.addEventListener('click', performSearch);
  searchInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      performSearch();
    }
  });
  
  dispensarySelect.addEventListener('change', filterResults);
}

/**
 * Setup search mode selector (regular vs similarity)
 */
function setupSearchModeSelector() {
  searchModeWrapper.className = 'search-mode-wrapper';
  searchModeWrapper.innerHTML = `
    <label for="searchMode">Search Mode:</label>
    <select id="searchMode">
      <option value="exact">Regular Search</option>
      <option value="similar">Semantic Similarity</option>
    </select>
  `;
  
  // Insert after search container
  document.querySelector('.search-container').after(searchModeWrapper);
}

/**
 * Load dispensaries for the filter dropdown
 */
async function loadDispensaries() {
  try {
    const response = await fetch(DISPENSARIES_ENDPOINT);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    if (result.success && result.data) {
      dispensaries = result.data;
      
      // Populate the dropdown
      dispensaries.forEach(dispensary => {
        const option = document.createElement('option');
        option.value = dispensary.id;
        option.textContent = dispensary.name;
        dispensarySelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Failed to load dispensaries:', error);
  }
}

/**
 * Perform product search
 */
async function performSearch() {
  const query = searchInput.value.trim();
  if (!query) {
    resultsBody.innerHTML = '<tr><td colspan="6">Please enter a search term.</td></tr>';
    return;
  }
  
  // Show loading state
  resultsBody.innerHTML = '<tr><td colspan="6">Searching...</td></tr>';
  
  try {
    // Determine whether to use regular or similarity search
    const searchMode = document.getElementById('searchMode').value;
    const endpoint = searchMode === 'similar' ? SIMILAR_SEARCH_ENDPOINT : SEARCH_ENDPOINT;
    
    const response = await fetch(`${endpoint}?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.data) {
      allProducts = result.data;
      
      if (allProducts.length > 0) {
        // Switch to table view mode
        setViewMode('table');
        // Apply any current filter and display results
        filterResults();
      } else {
        resultsBody.innerHTML = '<tr><td colspan="6">No products found matching your search.</td></tr>';
      }
    } else {
      resultsBody.innerHTML = `<tr><td colspan="6">Error: ${result.error || 'Unknown error'}</td></tr>`;
    }
  } catch (error) {
    console.error('Search failed:', error);
    resultsBody.innerHTML = '<tr><td colspan="6">Failed to fetch results. Please try again later.</td></tr>';
  }
}

/**
 * Filter results based on selected dispensary
 */
function filterResults() {
  const selectedDispensaryId = dispensarySelect.value;
  
  // If no products are loaded yet, don't do anything
  if (!allProducts || allProducts.length === 0) {
    return;
  }
  
  let filteredProducts = allProducts;
  
  // Apply dispensary filter if not "all"
  if (selectedDispensaryId !== 'all') {
    filteredProducts = allProducts.filter(product => {
      // Find the dispensary by name and check if IDs match
      const dispensary = dispensaries.find(d => d.name === product.dispensary_name);
      return dispensary && dispensary.id.toString() === selectedDispensaryId;
    });
  }
  
  // Display filtered results
  displayResults(filteredProducts);
}

/**
 * Display results in the table
 */
function displayResults(products) {
  if (products.length === 0) {
    resultsBody.innerHTML = '<tr><td colspan="6">No products match the current filters.</td></tr>';
    return;
  }
  
  resultsBody.innerHTML = '';
  
  products.forEach(product => {
    const row = resultsBody.insertRow();
    
    // Product name
    const nameCell = row.insertCell();
    nameCell.textContent = product.product_name || 'N/A';
    
    // Price
    const priceCell = row.insertCell();
    priceCell.textContent = product.price || 'N/A';
    
    // Weight/Size
    const sizeCell = row.insertCell();
    sizeCell.textContent = product.weight_or_size || 'N/A';
    
    // Dispensary
    const dispensaryCell = row.insertCell();
    dispensaryCell.textContent = product.dispensary_name || 'N/A';
    
    // Scraped At (formatted date)
    const dateCell = row.insertCell();
    if (product.scraped_at) {
      const date = new Date(product.scraped_at);
      dateCell.textContent = date.toLocaleString();
    } else {
      dateCell.textContent = 'N/A';
    }
    
    // Similar Products action
    const actionsCell = row.insertCell();
    actionsCell.className = 'actions-cell';
    
    // Only show similar button if the product has an ID
    if (product.id) {
      const similarButton = document.createElement('button');
      similarButton.className = 'similar-button';
      similarButton.textContent = 'Find Similar';
      similarButton.addEventListener('click', () => findSimilarProducts(product.id));
      actionsCell.appendChild(similarButton);
    }
  });
  
  // Ensure the table header includes an Actions column
  const headerRow = document.querySelector('#resultsTable thead tr');
  if (headerRow && headerRow.children.length < 6) {
    const actionsHeader = document.createElement('th');
    actionsHeader.textContent = 'Actions';
    headerRow.appendChild(actionsHeader);
  }
}

/**
 * Find similar products to a specific product
 */
async function findSimilarProducts(productId) {
  if (!productId) return;
  
  currentProductId = productId;
  
  // Show loading state
  resultsBody.innerHTML = '<tr><td colspan="6">Finding similar products...</td></tr>';
  
  try {
    // First, get the original product details
    const productResponse = await fetch(`${PRODUCTS_ENDPOINT}/${productId}`);
    if (!productResponse.ok) {
      throw new Error(`HTTP error! status: ${productResponse.status}`);
    }
    
    const productResult = await productResponse.json();
    if (!productResult.success || !productResult.data) {
      throw new Error('Failed to fetch product details');
    }
    
    const originalProduct = productResult.data;
    
    // Now get similar products
    const similarResponse = await fetch(`${PRODUCTS_ENDPOINT}/${productId}/similar?limit=10`);
    if (!similarResponse.ok) {
      throw new Error(`HTTP error! status: ${similarResponse.status}`);
    }
    
    const similarResult = await similarResponse.json();
    if (!similarResult.success) {
      throw new Error('Failed to fetch similar products');
    }
    
    // Switch to similar view mode and display results
    setViewMode('similar', originalProduct, similarResult.data);
  } catch (error) {
    console.error('Failed to find similar products:', error);
    resultsBody.innerHTML = '<tr><td colspan="6">Failed to find similar products. Please try again later.</td></tr>';
  }
}

/**
 * Set the current view mode (table or similar)
 */
function setViewMode(mode, originalProduct = null, similarProducts = null) {
  currentViewMode = mode;
  
  if (mode === 'table') {
    // Show the regular table view
    document.querySelector('.results-section h2').textContent = 'Results';
    
    // Hide similar product info if it exists
    const similarInfo = document.querySelector('.similar-product-info');
    if (similarInfo) {
      similarInfo.remove();
    }
    
    // Show the table
    resultsTable.style.display = 'table';
    
    // Display current products
    if (allProducts && allProducts.length > 0) {
      filterResults();
    }
  } else if (mode === 'similar' && originalProduct) {
    // Update section header
    document.querySelector('.results-section h2').textContent = 'Similar Products';
    
    // Remove existing similar product info
    const existingInfo = document.querySelector('.similar-product-info');
    if (existingInfo) {
      existingInfo.remove();
    }
    
    // Create and add similar product info section
    const similarInfo = document.createElement('div');
    similarInfo.className = 'similar-product-info';
    
    const backButton = document.createElement('button');
    backButton.className = 'back-button';
    backButton.textContent = '← Back to Search Results';
    backButton.addEventListener('click', () => {
      setViewMode('table');
    });
    
    const productDetails = document.createElement('div');
    productDetails.className = 'original-product';
    productDetails.innerHTML = `
      <h3>Similar to: ${originalProduct.product_name}</h3>
      <ul>
        <li><strong>Price:</strong> ${originalProduct.price}</li>
        ${originalProduct.weight_or_size ? `<li><strong>Size:</strong> ${originalProduct.weight_or_size}</li>` : ''}
        <li><strong>Dispensary:</strong> ${originalProduct.dispensary_name}</li>
      </ul>
    `;
    
    similarInfo.appendChild(backButton);
    similarInfo.appendChild(productDetails);
    
    // Insert before the table
    resultsTable.before(similarInfo);
    
    // Show the table
    resultsTable.style.display = 'table';
    
    // Display similar products
    if (similarProducts && similarProducts.length > 0) {
      displayResults(similarProducts);
    } else {
      resultsBody.innerHTML = '<tr><td colspan="6">No similar products found.</td></tr>';
    }
  }
}

/**
 * Display error message 
 */
function showError(message) {
  const errorElement = document.createElement('div');
  errorElement.className = 'error-message';
  errorElement.textContent = message;
  
  document.querySelector('.search-section').appendChild(errorElement);
  
  // Remove after a few seconds
  setTimeout(() => {
    errorElement.remove();
  }, 5000);
}