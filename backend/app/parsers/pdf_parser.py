"""
PDF Parser - Extract text from PDF files
Uses pdfplumber for text extraction
"""
import pdfplumber
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class PDFParser:
    """PDF text extraction using pdfplumber."""
    
    def __init__(self):
        """Initialize the PDF parser."""
        logger.info("PDF Parser initialized")
    
    def extract_text(self, file_path: str) -> Optional[str]:
        """
        Extract text from a PDF file.
        
        Args:
            file_path: Path to the PDF file
            
        Returns:
            Extracted text or None if extraction fails
        """
        try:
            text = ""
            
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    # Try standard extraction
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n\n"
                    else:
                        # Try extracting from tables if no direct text
                        tables = page.extract_tables()
                        for table in tables:
                            if table:
                                for row in table:
                                    if row:
                                        text += " ".join(str(cell) for cell in row if cell) + "\n"
            
            logger.info(f"Extracted {len(text)} characters from PDF")
            
            # If still no text, return a message
            if not text or len(text.strip()) == 0:
                logger.warning("PDF appears to be empty or image-based (scanned)")
                return "[PDF contains no extractable text - may be a scanned image or protected PDF]"
            
            return text.strip()
            
        except Exception as e:
            logger.error(f"Error extracting text from PDF: {e}")
            return None
    
    def extract_text_with_layout(self, file_path: str) -> Optional[dict]:
        """
        Extract text with layout information from a PDF file.
        
        Args:
            file_path: Path to the PDF file
            
        Returns:
            Dictionary with text and layout information
        """
        try:
            result = {
                'text': '',
                'pages': 0,
                'tables': [],
                'metadata': {}
            }
            
            with pdfplumber.open(file_path) as pdf:
                result['pages'] = len(pdf.pages)
                result['metadata'] = pdf.metadata or {}
                
                for i, page in enumerate(pdf.pages):
                    page_text = page.extract_text()
                    if page_text:
                        result['text'] += page_text + "\n\n"
                    
                    # Extract tables
                    tables = page.extract_tables()
                    for table in tables:
                        result['tables'].append({
                            'page': i + 1,
                            'table': table
                        })
            
            result['text'] = result['text'].strip()
            return result
            
        except Exception as e:
            logger.error(f"Error extracting text with layout from PDF: {e}")
            return None
    
    def extract_page_range(self, file_path: str, start_page: int = 0, end_page: Optional[int] = None) -> Optional[str]:
        """
        Extract text from a specific page range.
        
        Args:
            file_path: Path to the PDF file
            start_page: Start page (0-indexed)
            end_page: End page (exclusive, 0-indexed)
            
        Returns:
            Extracted text or None if extraction fails
        """
        try:
            text = ""
            
            with pdfplumber.open(file_path) as pdf:
                end_page = end_page or len(pdf.pages)
                
                for i in range(start_page, min(end_page, len(pdf.pages))):
                    page_text = pdf.pages[i].extract_text()
                    if page_text:
                        text += page_text + "\n\n"
            
            return text.strip() if text else None
            
        except Exception as e:
            logger.error(f"Error extracting page range from PDF: {e}")
            return None
