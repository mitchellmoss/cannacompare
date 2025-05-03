// DOM Elements
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const resultsBody = document.getElementById('resultsBody');
const dispensarySelect = document.getElementById('dispensarySelect');

// API Endpoints
const API_BASE_URL = '/api';
const SEARCH_ENDPOINT = `${API_BASE_URL}/products/search`;
const DISPENSARIES_ENDPOINT = `${API_BASE_URL}/dispensaries`;

// State
let allProducts = [];
let dispensaries = [];

// Initialize the app
document.addEventListener('DOMContentLoaded', init);

async function init() {
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
    resultsBody.innerHTML = '<tr><td colspan="5">Please enter a search term.</td></tr>';
    return;
  }
  
  // Show loading state
  resultsBody.innerHTML = '<tr><td colspan="5">Searching...</td></tr>';
  
  try {
    const response = await fetch(`${SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.data) {
      allProducts = result.data;
      
      if (allProducts.length > 0) {
        // Apply any current filter and display results
        filterResults();
      } else {
        resultsBody.innerHTML = '<tr><td colspan="5">No products found matching your search.</td></tr>';
      }
    } else {
      resultsBody.innerHTML = `<tr><td colspan="5">Error: ${result.error || 'Unknown error'}</td></tr>`;
    }
  } catch (error) {
    console.error('Search failed:', error);
    resultsBody.innerHTML = '<tr><td colspan="5">Failed to fetch results. Please try again later.</td></tr>';
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
    resultsBody.innerHTML = '<tr><td colspan="5">No products match the current filters.</td></tr>';
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
  });
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